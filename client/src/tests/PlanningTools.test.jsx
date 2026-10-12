// ─────────────────────────────────────────────────────────────
// src/tests/PlanningTools.test.jsx
//
// Three tools on the Operations reports page: the reorder planner, the
// exception alerts and the workload heatmap. Plus the root cause
// analysis under the flow map. Each must show what the server worked
// out in terms a manager can act on, and narrow or open as asked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rootCauses, targetTest, applyFilters, filterLabel } from '../features/reporting/flowGraph';

const api = vi.hoisted(() => ({ getReorderPlan: vi.fn(), getExceptionAlerts: vi.fn(), getWorkload: vi.fn() }));
vi.mock('../services/reportingAPI', () => api);
vi.mock('../lib/excelExport', () => ({ exportExcel: vi.fn() }));

const { default: ReorderPlanner } = await import('../features/reporting/ReorderPlanner');
const { default: ExceptionAlerts } = await import('../features/reporting/ExceptionAlerts');
const { default: WorkloadHeatmap } = await import('../features/reporting/WorkloadHeatmap');
const { default: ProcessFlow } = await import('../features/reporting/ProcessFlow');

beforeEach(() => vi.clearAllMocks());

// ── Reorder planner ─────────────────────────────────────────
const item = (over = {}) => ({
  productId: 1, product: 'Rice 2 kg', unit: 'bag', supplier: 'Cape Dry Goods', onHand: 15, onOrder: 0, nextDelivery: null,
  weeklyDemand: 35, demandBasis: 'standing_orders', standingWeekly: 35, actualWeekly: 20, excludedOrderLines: 0,
  leadDays: 4, leadAssumed: false, reorderLevel: 20, status: 'order_now', daysOfCover: 3,
  stockOut: '2026-10-15', stockOutWithOrders: '2026-10-15', orderBy: '2026-10-11', suggestedQuantity: 265,
  projection: [{ week: 1, weekEnding: '2026-10-19', balance: 0 }, { week: 2, weekEnding: '2026-10-26', balance: 0 }],
  ...over,
});
const PLAN = {
  today: '2026-10-12', horizonWeeks: 8, historyWeeks: 8, defaultLeadDays: 7, assumedLeadTimes: 1,
  summary: { out_of_stock: 0, order_now: 1, order_soon: 0, planned: 1, covered: 1, no_demand: 0 },
  items: [
    item(),
    item({ productId: 2, product: 'Beans 5 kg', status: 'planned', onHand: 200, orderBy: '2026-11-20', stockOut: '2026-11-21', leadAssumed: true, leadDays: 7 }),
    item({ productId: 3, product: 'Oil 750 ml', status: 'covered', suggestedQuantity: 0, onHand: 900 }),
  ],
};

describe('the reorder planner', () => {
  beforeEach(() => api.getReorderPlan.mockResolvedValue({ data: PLAN }));

  it('opens on what needs ordering, with the date and the quantity', async () => {
    render(<ReorderPlanner />);
    expect(await screen.findByRole('button', { name: 'Rice 2 kg' })).toBeInTheDocument();
    expect(api.getReorderPlan).toHaveBeenCalledWith(8);
    const row = screen.getByRole('row', { name: /Rice 2 kg/ });
    expect(within(row).getByText('Order now')).toBeInTheDocument();
    expect(within(row).getByText('11 Oct 2026')).toBeInTheDocument();
    expect(within(row).getByText('265 bag')).toBeInTheDocument();
    // Not due yet: off the list until asked for.
    expect(screen.queryByRole('button', { name: 'Beans 5 kg' })).not.toBeInTheDocument();
  });

  it('narrows by status and by search', async () => {
    render(<ReorderPlanner />);
    await screen.findByRole('button', { name: 'Rice 2 kg' });
    await userEvent.click(screen.getByRole('button', { name: /^All products/ }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
    await userEvent.type(screen.getByLabelText('Search'), 'oil');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Oil 750 ml' })).toBeInTheDocument();
  });

  it('opens a product to where its figures come from and its projection', async () => {
    render(<ReorderPlanner />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rice 2 kg' }));
    expect(screen.getByText('Standing orders')).toBeInTheDocument();
    expect(screen.getByText('4 days (median, PO raised to first receipt)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Projected balance: week 1 0, week 2 0/ })).toBeInTheDocument();
  });

  it('marks an assumed lead time and explains the mark', async () => {
    render(<ReorderPlanner />);
    await screen.findByRole('button', { name: 'Rice 2 kg' });
    await userEvent.click(screen.getByRole('button', { name: /^Order later/ }));
    expect(within(screen.getByRole('row', { name: /Beans 5 kg/ })).getByText('7 d*')).toBeInTheDocument();
    expect(screen.getByText(/Lead time assumed at 7 days for 1 product with no receipt history/)).toBeInTheDocument();
  });

  it('asks again when the horizon changes', async () => {
    render(<ReorderPlanner />);
    await screen.findByRole('button', { name: 'Rice 2 kg' });
    await userEvent.selectOptions(screen.getByLabelText('Planning horizon'), '12');
    await waitFor(() => expect(api.getReorderPlan).toHaveBeenLastCalledWith(12));
  });

  it('says so when nothing needs ordering', async () => {
    api.getReorderPlan.mockResolvedValue({ data: { ...PLAN, items: PLAN.items.slice(2) } });
    render(<ReorderPlanner />);
    expect(await screen.findByText('No product needs ordering within 7 days on a 8-week horizon.')).toBeInTheDocument();
  });
});

// ── Exception alerts ────────────────────────────────────────
const points = (values) => values.map((value, i) => ({ label: `2026-W${30 + i}`, value }));
const ALERTS = {
  range: { from: '2026-07-13', to: '2026-10-11' }, baselineWeeks: 12, latestWeek: '2026-W41',
  summary: { adverse: 1, trend: 0, unusual: 0, favourable: 1, inControl: 1, insufficient: 1 },
  items: [
    { metric: 'decanting_wastage', label: 'Decanting wastage', unit: '%', better: 'down', points: points([4, 6, 4, 6, 4, 6, 12]),
      status: 'out_of_control', signal: 'adverse', latest: 12, mean: 5, lower: 2.81, upper: 7.19, deviation: 6.4, baselineWeeks: 6 },
    { metric: 'dispatch_volume', label: 'Food dispatched', unit: 'kg', better: 'up', points: points([400, 420, 410, 430, 405, 415, 900]),
      status: 'out_of_control', signal: 'favourable', latest: 900, mean: 413, lower: 390, upper: 436, deviation: 9, baselineWeeks: 6 },
    { metric: 'picking_flag_rate', label: 'Picking flag rate', unit: '%', better: 'down', points: points([4, 6, 4, 6, 4, 6, 5]),
      status: 'in_control', signal: null, latest: 5, mean: 5, lower: 2.81, upper: 7.19, deviation: 0, baselineWeeks: 6 },
    { metric: 'po_on_time_rate', label: 'On-time deliveries', unit: '%', better: 'up', points: points([90, 80]),
      status: 'insufficient', signal: null, latest: 80, mean: null, lower: null, upper: null, deviation: null, baselineWeeks: 1 },
  ],
};

describe('exception alerts', () => {
  beforeEach(() => api.getExceptionAlerts.mockResolvedValue({ data: ALERTS }));

  it('says how many measures are flagged, and how', async () => {
    render(<ExceptionAlerts />);
    expect(await screen.findByRole('status')).toHaveTextContent('2 of 4 measures flagged in week 2026-W41: 1 adverse, 0 trending, 0 outside limits, 1 favourable.');
  });

  it('shows each measure against its control limits', async () => {
    render(<ExceptionAlerts />);
    const card = (await screen.findByRole('heading', { name: 'Decanting wastage' })).closest('li');
    expect(within(card).getByText('Adverse')).toBeInTheDocument();
    expect(within(card).getByText('12%')).toBeInTheDocument();
    expect(within(card).getByText('Expected 2,8% to 7,2% · +6,4σ')).toBeInTheDocument();
    expect(within(card).getByText('Lower is better')).toBeInTheDocument();
    const quiet = screen.getByRole('heading', { name: 'Picking flag rate' }).closest('li');
    expect(within(quiet).getByText('In control')).toBeInTheDocument();
  });

  it('does not judge a measure with too little history', async () => {
    render(<ExceptionAlerts />);
    const card = (await screen.findByRole('heading', { name: 'On-time deliveries' })).closest('li');
    expect(within(card).getByText('Insufficient history')).toBeInTheDocument();
    expect(within(card).getByText('1 of 6 baseline weeks recorded.')).toBeInTheDocument();
  });

  it('can show the exceptions only, and opens the report behind one', async () => {
    const onOpenReport = vi.fn();
    render(<ExceptionAlerts onOpenReport={onOpenReport} />);
    await screen.findByRole('heading', { name: 'Decanting wastage' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Exceptions only' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Open report: Decanting wastage' }));
    expect(onOpenReport).toHaveBeenCalledWith('decanting_wastage');
  });

  it('says a quiet week is quiet', async () => {
    api.getExceptionAlerts.mockResolvedValue({ data: { ...ALERTS, items: ALERTS.items.slice(2) } });
    render(<ExceptionAlerts />);
    expect(await screen.findByRole('status')).toHaveTextContent('No exceptions in week 2026-W41.');
  });
});

// ── Workload heatmap ────────────────────────────────────────
const HOURS = [7, 8, 9];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const area = (id, label, unit, busy) => {
  const cells = WEEKDAYS.flatMap((_, d) => HOURS.map((hour) => {
    const total = busy && d === 0 && hour === 8 ? 6 : busy && d === 2 && hour === 9 ? 2 : 0;
    return { weekday: d, hour, total, average: total / 2 };
  }));
  const total = cells.reduce((s, c) => s + c.total, 0);
  return {
    id, label, unit, total, cells, max: busy ? 6 : 0, maxAverage: busy ? 3 : 0,
    peak: busy ? { weekday: 'Monday', hour: 8, average: 3, total: 6 } : null,
    busiestDay: busy ? { label: 'Monday', total: 6, average: 3 } : null,
    byWeekday: WEEKDAYS.map((l, d) => ({ label: l, total: d === 0 && busy ? 6 : d === 2 && busy ? 2 : 0, average: d === 0 && busy ? 3 : d === 2 && busy ? 1 : 0 })),
    byHour: HOURS.map((hour) => ({ hour, total: 0 })),
  };
};
const WORKLOAD = {
  range: { from: '2026-09-28', to: '2026-10-11' }, hours: HOURS, weekdays: WEEKDAYS, occurrences: [2, 2, 2, 2, 2, 2, 2], empty: false,
  areas: [area('receiving', 'Receiving', 'deliveries received', true), area('gate', 'Dispatch gate', 'pallets released', false)],
};

describe('the workload heatmap', () => {
  beforeEach(() => api.getWorkload.mockResolvedValue({ data: WORKLOAD }));

  it('shows the peak hour, the busiest day and the grid', async () => {
    render(<WorkloadHeatmap />);
    expect(await screen.findByText('Monday 08:00')).toBeInTheDocument();
    expect(screen.getByText('3 on an average Monday')).toBeInTheDocument();
    const grid = screen.getByRole('table', { name: 'Receiving: deliveries received by weekday and hour' });
    const monday = within(grid).getByRole('row', { name: /^Monday/ });
    expect(within(monday).getAllByRole('cell')[1]).toHaveTextContent('3');
  });

  it('switches between the weekday average and the total', async () => {
    render(<WorkloadHeatmap />);
    await screen.findByText('Monday 08:00');
    await userEvent.click(screen.getByRole('button', { name: 'Total' }));
    const monday = screen.getByRole('row', { name: /^Monday/ });
    expect(within(monday).getAllByRole('cell')[1]).toHaveTextContent('6');
  });

  it('says so for an area with nothing recorded', async () => {
    render(<WorkloadHeatmap />);
    await screen.findByText('Monday 08:00');
    await userEvent.selectOptions(screen.getByLabelText('Area'), 'gate');
    expect(screen.getByText('No pallets released recorded in this period. Select a longer period.')).toBeInTheDocument();
  });
});

// ── Root cause analysis ─────────────────────────────────────
const ACTIVITIES = ['PO raised', 'PO approved', 'Goods received', 'Receipt discrepancy', 'Fully received'].map((label, id) => ({ id: String(id), label }));
const kase = (id, path, Supplier, t) => ({ id, label: `PO-${id} · ${Supplier}`, path, t: t ?? path.map((_, i) => i * 24), attrs: { Supplier, 'Weekday raised': id % 2 ? 'Monday' : 'Tuesday' } });
const GOOD = [0, 1, 2, 4];
const BAD = [0, 1, 3, 4];
const ORDERS = {
  id: 'orders', label: 'Purchase orders', caseNoun: 'purchase orders', activities: ACTIVITIES, expected: GOOD, total: 12, truncated: false,
  cases: [
    ...[1, 2, 3, 4, 5, 6].map((id) => kase(id, GOOD, 'Cape Dry Goods')),
    kase(7, BAD, 'Cape Dry Goods'),
    ...[8, 9, 10, 11].map((id) => kase(id, BAD, 'Slow Mills')),
    kase(12, GOOD, 'Slow Mills'),
  ],
};

describe('root cause analysis', () => {
  it('ranks the attribute values over-represented among deviating cases', () => {
    const out = rootCauses(ORDERS.cases, targetTest(ORDERS, ORDERS.cases, 'deviation'));
    expect(out).toMatchObject({ total: 12, affected: 5, rate: 41.7 });
    expect(out.rows[0]).toMatchObject({ key: 'Supplier', value: 'Slow Mills', cases: 5, affected: 4, rate: 80, excess: 1.9 });
    // A supplier doing better than the overall rate is not a cause.
    expect(out.rows.some((r) => r.value === 'Cape Dry Goods')).toBe(false);
  });

  it('ignores a value too few cases carry, and one every case shares', () => {
    const cases = [kase(1, BAD, 'One-off Ltd'), ...[2, 3, 4, 5].map((id) => kase(id, GOOD, 'Cape Dry Goods'))];
    expect(rootCauses(cases, targetTest(ORDERS, cases, 'deviation')).rows).toEqual([]);
    const same = [1, 3, 5, 7].map((id) => ({ ...kase(id, id < 5 ? BAD : GOOD, 'Only Supplier'), attrs: { Supplier: 'Only Supplier' } }));
    expect(rootCauses(same, targetTest(ORDERS, same, 'deviation')).rows).toEqual([]);
  });

  it('can look for rework and for long cycle times instead', () => {
    const loop = { ...kase(20, [0, 1, 2, 1, 2, 4], 'Slow Mills') };
    expect(targetTest(ORDERS, [loop], 'rework')(loop)).toBe(true);
    expect(targetTest(ORDERS, ORDERS.cases, 'rework')(ORDERS.cases[0])).toBe(false);
    const timed = [1, 2, 3, 4].map((id) => kase(id, GOOD, 'Cape Dry Goods', [0, 1, 2, id * 10]));
    const slow = targetTest(ORDERS, timed, 'slow');
    expect(timed.map(slow)).toEqual([false, false, false, true]);
  });

  it('narrows the cases to one attribute value', () => {
    const f = { kind: 'attr', key: 'Supplier', value: 'Slow Mills' };
    expect(applyFilters(ORDERS.cases, [f])).toHaveLength(5);
    expect(filterLabel(ORDERS, f)).toBe('Supplier: Slow Mills');
  });

  it('shows the ranking under the flow map and filters to a row', async () => {
    render(<ProcessFlow flow={{ processes: [ORDERS] }} range={{ from: '2026-08-01', to: '2026-10-12' }} />);
    const panel = screen.getByRole('region', { name: 'Root cause analysis' });
    expect(panel).toHaveTextContent('5 of 12 purchase orders affected (41.7%).');
    const row = within(panel).getByRole('row', { name: /Slow Mills/ });
    expect(row).toHaveTextContent('4 of 5');
    expect(row).toHaveTextContent('80%');
    expect(row).toHaveTextContent('+1.9');

    await userEvent.click(within(panel).getByRole('button', { name: 'Filter to Supplier: Slow Mills' }));
    expect(screen.getByRole('button', { name: /Supplier: Slow Mills/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Root cause analysis' })).toHaveTextContent('4 of 5 purchase orders affected (80%).');
  });

  it('says so when nothing stands out', async () => {
    const even = { ...ORDERS, cases: [1, 2, 3, 4, 5, 6].map((id) => kase(id, GOOD, id % 2 ? 'A' : 'B')) };
    render(<ProcessFlow flow={{ processes: [even] }} range={{ from: '2026-08-01', to: '2026-10-12' }} />);
    expect(screen.getByRole('region', { name: 'Root cause analysis' })).toHaveTextContent('No affected cases in scope.');
  });
});
