// ─────────────────────────────────────────────────────────────
// src/tests/PlanningTools.test.jsx
//
// Two tools on the Operations reports page: the reorder planner and the
// exception alerts. (The workload heatmap is a report now, drawn by
// OperationalChart: see OperationalChart.test.jsx.) Plus the root cause
// analysis under the flow map. Each must show what the server worked
// out in terms a manager can act on, and narrow or open as asked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rootCauses, targetTest, applyFilters, filterLabel } from '../features/reporting/flowGraph';

const api = vi.hoisted(() => ({ getReorderPlan: vi.fn(), getExceptionAlerts: vi.fn() }));
vi.mock('../services/reportingAPI', () => api);
vi.mock('../lib/excelExport', () => ({ exportExcel: vi.fn() }));

const { default: ReorderPlanner } = await import('../features/reporting/ReorderPlanner');
const { default: ExceptionAlerts } = await import('../features/reporting/ExceptionAlerts');
const { default: ProcessFlow } = await import('../features/reporting/ProcessFlow');

beforeEach(() => vi.clearAllMocks());

// ── Reorder planner ─────────────────────────────────────────
const item = (over = {}) => ({
  productId: 1, name: 'Rice 2 kg', unit: 'bag', supplier: 'Cape Dry Goods',
  onHand: 25, committed: 10, available: 15, incoming: 0, nextDelivery: null, overdue: 0, overdueOrders: 0, ifOverdueArrived: null,
  weeklyDemand: 35, demandSource: 'planned', demandLabel: 'Summer recipe', recipeWeekly: 35, standingWeekly: 0, historyWeekly: 20,
  leadDays: 4, leadSource: 'median', leadLabel: 'Median of 3 orders: 4 days', reorderLevel: 20, limits: ['No agreed lead time for Cape Dry Goods'],
  status: 'order_now', daysOfCover: 3.6, weeksOfCover: 0.5, coverDays: 3,
  runsOutOn: '2026-10-15', shelfRunsOutOn: '2026-10-15', orderBy: '2026-10-11', suggestedQuantity: 265,
  projection: [{ week: 1, weekEnding: '2026-10-19', balance: 0 }, { week: 2, weekEnding: '2026-10-26', balance: 0 }],
  ...over,
});
const PLAN = {
  today: '2026-10-12', horizonWeeks: 8, historyWeeks: 8, defaultLeadDays: 7, recipeName: 'Summer',
  assumedLeadTimes: 1, agreedLeadTimes: 0, limited: 2,
  summary: { out_of_stock: 0, order_now: 1, order_soon: 0, planned: 1, covered: 1, no_demand: 0 },
  items: [
    item(),
    item({
      productId: 2, name: 'Beans 5 kg', status: 'planned', available: 200, orderBy: '2026-11-20', runsOutOn: '2026-11-21',
      leadSource: 'assumed', leadLabel: 'Assumed 7 days', leadDays: 7, overdue: 40, overdueOrders: 1,
      ifOverdueArrived: { weeksOfCover: 6, coverDays: 42, runsOutOn: '2026-11-23' },
      limits: ['No agreed lead time or delivery history', 'Overdue, chase supplier'],
    }),
    item({ productId: 3, name: 'Oil 750 ml', status: 'covered', suggestedQuantity: 0, available: 900, limits: [] }),
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
    expect(within(row).getByText('265 bags')).toBeInTheDocument();
    // Where the figures came from, and what is missing.
    expect(within(row).getByText('Summer recipe')).toBeInTheDocument();
    expect(within(row).getByText('Median')).toBeInTheDocument();
    expect(within(row).getByText('No agreed lead time for Cape Dry Goods')).toBeInTheDocument();
    // Not due yet: off the list until asked for.
    expect(screen.queryByRole('button', { name: 'Beans 5 kg' })).not.toBeInTheDocument();
  });

  it('narrows by status and by search', async () => {
    render(<ReorderPlanner />);
    await screen.findByRole('button', { name: 'Rice 2 kg' });
    await userEvent.click(screen.getByRole('button', { name: /^All products/ }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
    await userEvent.type(screen.getByLabelText('Search product or supplier'), 'oil');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Oil 750 ml' })).toBeInTheDocument();
  });

  it('opens a product to where its figures come from and its projection', async () => {
    render(<ReorderPlanner />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rice 2 kg' }));
    expect(screen.getByText('Median of 3 orders: 4 days')).toBeInTheDocument();
    expect(screen.getByText('35 bags a week (recipe 35, standing orders 0)')).toBeInTheDocument();
    expect(screen.getByText('25 bags, 10 bags committed')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Projected balance: week 1 0, week 2 0/ })).toBeInTheDocument();
  });

  it('marks an assumed lead time and an overdue order, and explains both', async () => {
    render(<ReorderPlanner />);
    await screen.findByRole('button', { name: 'Rice 2 kg' });
    await userEvent.click(screen.getByRole('button', { name: /^Order later/ }));
    const row = screen.getByRole('row', { name: /Beans 5 kg/ });
    expect(within(row).getByText('7 d*')).toBeInTheDocument();
    expect(within(row).getByText('40 overdue')).toBeInTheDocument();
    expect(within(row).getByText('2 gaps in the data, open for detail')).toBeInTheDocument();
    expect(screen.getByText(/Lead time assumed at 7 days for 1 product with no agreed time or delivery history/)).toBeInTheDocument();
    expect(screen.getByText(/No supplier has an agreed lead time yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Beans 5 kg' }));
    expect(screen.getByText('40 bags on 1 order. If it arrived today, runs out 23 Nov 2026')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Missing data' })).getByText('Overdue, chase supplier')).toBeInTheDocument();
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
