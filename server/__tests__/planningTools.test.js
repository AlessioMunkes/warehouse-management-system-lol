// ─────────────────────────────────────────────────────────────
// __tests__/planningTools.test.js
//
// The arithmetic of three tools on the Operations reports page: the
// reorder planner, the exception alerts and the workload heatmap. Each
// is tested as arithmetic: known rows in, known answer out.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildReorderPlan } from '../src/features/reporting/reorderPlan.js';
import { assess, alignWeeks, completeWeeks, rankAlerts } from '../src/features/reporting/controlLimits.js';
import { workloadSeries, weekdayCounts } from '../src/features/reporting/workload.js';

const TODAY = '2026-10-12';   // a Monday

describe('the reorder planner', () => {
  // Every figure is the shared stock cover (stockCover.test.js works
  // them by hand); the planner only counts what it shows.
  const item = (name, status, leadSource, limits = []) => ({ name, status, leadSource, limits });

  it('counts each status, and the lead times that were agreed or assumed', () => {
    const plan = buildReorderPlan({
      today: TODAY, horizonWeeks: 8,
      items: [
        item('Oil', 'out_of_stock', 'assumed'),
        item('Rice', 'order_now', 'median', ['No agreed lead time for Cape Dry Goods']),
        item('Samp', 'order_soon', 'agreed'),
        item('Beans', 'covered', 'assumed'),
        item('Salt', 'no_demand', 'assumed'),
      ],
    });
    expect(plan.summary).toMatchObject({ out_of_stock: 1, order_now: 1, order_soon: 1, planned: 0, covered: 1, no_demand: 1 });
    // Salt has no demand, so its missing lead time is nobody's problem.
    expect(plan.assumedLeadTimes).toBe(2);
    expect(plan.agreedLeadTimes).toBe(1);
    expect(plan.limited).toBe(1);
    expect(plan.items.map((i) => i.name)).toEqual(['Oil', 'Rice', 'Samp', 'Beans', 'Salt']);
  });
});

describe('exception alerts', () => {
  const pts = (values) => values.map((value, i) => ({ label: `W${i + 1}`, value }));

  it('takes the last complete weeks, leaving out the week in progress', () => {
    const w = completeWeeks('2026-10-14', 3);        // a Wednesday
    expect(w).toEqual({ from: '2026-09-21', to: '2026-10-11', labels: ['2026-W39', '2026-W40', '2026-W41'] });
  });

  it('lines a report up with the weeks, a missing week being zero for a volume and no reading for a rate', () => {
    const series = [{ label: '2026-W39', value: 5 }, { label: '2026-W41', value: 7 }];
    const labels = ['2026-W39', '2026-W40', '2026-W41'];
    expect(alignWeeks(series, labels).map((p) => p.value)).toEqual([5, null, 7]);
    expect(alignWeeks(series, labels, { fillZero: true }).map((p) => p.value)).toEqual([5, 0, 7]);
  });

  it('sets limits two standard deviations either side of the baseline mean', () => {
    const a = assess(pts([4, 6, 4, 6, 4, 6, 5]), 'down');
    expect(a).toMatchObject({ mean: 5, sigma: 1.1, lower: 2.81, upper: 7.19, status: 'in_control', signal: null, baselineWeeks: 6 });
  });

  it('calls a week beyond the limit adverse or favourable by which way is good', () => {
    const wastage = assess(pts([4, 6, 4, 6, 4, 6, 12]), 'down');
    expect(wastage).toMatchObject({ status: 'out_of_control', side: 'above', signal: 'adverse', deviation: 6.4 });
    expect(assess(pts([4, 6, 4, 6, 4, 6, 12]), 'up').signal).toBe('favourable');
    expect(assess(pts([4, 6, 4, 6, 4, 6, 1]), 'up')).toMatchObject({ side: 'below', signal: 'adverse' });
    expect(assess(pts([4, 6, 4, 6, 4, 6, 12]), null).signal).toBe('unusual');
  });

  it('flags three weeks running the wrong way before a limit is crossed', () => {
    const a = assess(pts([5, 3, 6, 4, 5.2, 5.4, 5.6, 5.8]), 'down');
    expect(a).toMatchObject({ status: 'in_control', signal: 'trend', trend: true });
    expect(assess(pts([5, 3, 6, 4, 5.2, 5.4, 5.6, 5.8]), 'up').signal).toBeNull();
  });

  it('does not judge a measure with too little history, or no reading this week', () => {
    expect(assess(pts([4, 6, 4, 12]), 'down')).toMatchObject({ status: 'insufficient', signal: null, upper: null });
    expect(assess(pts([4, 6, 4, 6, 4, 6, null]), 'down').status).toBe('insufficient');
  });

  it('treats any change from a flat baseline as out of control', () => {
    expect(assess(pts([5, 5, 5, 5, 5, 5, 6]), 'down')).toMatchObject({ status: 'out_of_control', signal: 'adverse', deviation: null });
    expect(assess(pts([5, 5, 5, 5, 5, 5, 5]), 'down').status).toBe('in_control');
  });

  it('puts the adverse first, then the worsening, the unusual, the favourable, the quiet', () => {
    const item = (label, signal, status = 'in_control', deviation = 1) => ({ label, signal, status, deviation });
    const ranked = rankAlerts([
      item('quiet', null), item('good', 'favourable', 'out_of_control'), item('odd', 'unusual', 'out_of_control'),
      item('new', null, 'insufficient'), item('worse', 'trend'), item('bad', 'adverse', 'out_of_control', 2.5),
      item('very bad', 'adverse', 'out_of_control', -4),
    ]);
    expect(ranked.map((i) => i.label)).toEqual(['very bad', 'bad', 'worse', 'odd', 'good', 'quiet', 'new']);
  });
});

describe('the workload heatmap', () => {
  const RANGE = { from: '2026-09-28', to: '2026-10-11' };   // two full weeks
  const rows = [
    { area: 'receiving', weekday: 1, hour: 8, events: 6 },
    { area: 'receiving', weekday: 1, hour: 9, events: 2 },
    { area: 'receiving', weekday: 3, hour: 8, events: 2 },
    { area: 'gate', weekday: 2, hour: 10, events: 30 },
    { area: 'gate', weekday: 4, hour: 19, events: 1 },
  ];

  it('counts how often each weekday falls in the period', () => {
    expect(weekdayCounts('2026-09-28', '2026-10-11')).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(weekdayCounts('2026-10-12', '2026-10-14')).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  // The workload report's rows (reportCatalog.js `workload`), drawn as
  // a heatmap: "08|Mon", the average for that weekday.
  const cell = (series, label) => series.find((r) => r.label === label)?.value;

  it('lays one area out by hour and weekday, as the average for that weekday', () => {
    const series = workloadSeries(rows, { dimension: 'hour_weekday', area: 'receiving', ...RANGE });
    expect(cell(series, '08|Mon')).toBe(3);   // 6 over two Mondays
    expect(cell(series, '09|Mon')).toBe(1);
    expect(cell(series, '08|Wed')).toBe(1);
    expect(cell(series, '10|Tue')).toBe(0);   // the gate's, not receiving's
  });

  it('adds the areas together when none is chosen', () => {
    const series = workloadSeries(rows, { dimension: 'hour_weekday', ...RANGE });
    expect(cell(series, '10|Tue')).toBe(15);
    expect(cell(series, '08|Mon')).toBe(3);
  });

  it('is a full grid: the working day always, stretched for work outside it', () => {
    const quiet = workloadSeries(rows, { dimension: 'hour_weekday', area: 'receiving', ...RANGE });
    expect(quiet).toHaveLength(11 * 7);       // 07 to 17, every weekday
    expect(quiet[0].label).toBe('07|Mon');
    const late = workloadSeries(rows, { dimension: 'hour_weekday', ...RANGE });
    expect(late[late.length - 1].label).toBe('19|Sun');
    expect(workloadSeries([], { dimension: 'hour_weekday', ...RANGE }).every((r) => r.value === 0)).toBe(true);
  });

  it('gives the average for each weekday, Monday to Sunday', () => {
    const series = workloadSeries(rows, { dimension: 'weekday', area: 'receiving', ...RANGE });
    expect(series.map((r) => r.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(series[0].value).toBe(4);           // 8 over two Mondays
    expect(series[2].value).toBe(1);
  });
});
