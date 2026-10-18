// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.periods.test.js
//
// The period a question names is worked out on the server, the same
// way for the AI path and the keyword fallback. A manager who asked
// about today was shown the last three months; these pin the days
// each phrase means, and that the model is held to them.
// No database and no network.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const provider = vi.hoisted(() => ({
  isEnabled: vi.fn(() => true), providerName: vi.fn(() => 'test'), callWithTools: vi.fn(),
}));
const reporting = vi.hoisted(() => ({
  todayISO: vi.fn(() => '2026-10-11'), getCatalog: vi.fn(), runReport: vi.fn(),
}));
const insight = vi.hoisted(() => ({ runComparison: vi.fn() }));

vi.mock('../src/config/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../src/features/reporting/provider.js', () => ({ default: provider }));
vi.mock('../src/services/reporting.service.js', () => ({ default: reporting }));
vi.mock('../src/services/reportingInsight.service.js', () => ({ default: insight }));
vi.mock('../src/repositories/reportingLog.repository.js', () => ({ default: { record: vi.fn() } }));
vi.mock('../src/repositories/knownPeople.repository.js', () => ({
  default: { listNames: vi.fn(async () => ({ names: [], keep: [] })) },
}));

const { findPeriods, periodFromQuestion, singlePeriod } = await import('../src/features/reporting/periods.js');
const { matchQuestion, resolveDates } = await import('../src/features/reporting/keywordFallback.js');
const { presetRange } = await import('../src/features/reporting/savedReports.js');
const { ask } = await import('../src/services/reportingAi.service.js');

// A Sunday, so "this week" started six days earlier.
const TODAY = '2026-10-11';
const range = (q, today = TODAY) => {
  const p = periodFromQuestion(q, today);
  return p ? `${p.from}..${p.to}` : null;
};

describe('the period a question names', () => {
  it.each([
    ['stock received today', '2026-10-11..2026-10-11'],
    ["what are today's deliveries", '2026-10-11..2026-10-11'],
    ['what did we dispatch yesterday', '2026-10-10..2026-10-10'],
    ['food dispatched this week', '2026-10-05..2026-10-11'],
    ['collections last week', '2026-09-28..2026-10-04'],
    ['spend this month', '2026-10-01..2026-10-11'],
    ['spend last month', '2026-09-01..2026-09-30'],
    ['wastage this year', '2026-01-01..2026-10-11'],
    ['wastage last year', '2025-01-01..2025-12-31'],
    ['goods received in the last 7 days', '2026-10-05..2026-10-11'],
    ['goods received in the past 30 days', '2026-09-12..2026-10-11'],
    ['over the past week', '2026-10-05..2026-10-11'],
    ['dispatch for the last 2 weeks', '2026-09-27..2026-10-11'],
    ['spend over the last 6 months', '2026-04-11..2026-10-11'],
    ['what was received in September', '2026-09-01..2026-09-30'],
    ['received in October', '2026-10-01..2026-10-11'],
    ['received in December', '2025-12-01..2025-12-31'],
    ['spend for March 2026', '2026-03-01..2026-03-31'],
    ['dispatch since the beginning of August', '2026-08-01..2026-10-11'],
    ['received on 2026-10-03', '2026-10-03..2026-10-03'],
    ['received from 2026-10-01 to 2026-10-05', '2026-10-01..2026-10-05'],
  ])('%s', (q, want) => {
    expect(range(q)).toBe(want);
  });

  it('starts the week on Monday, on a Monday too', () => {
    expect(range('this week', '2026-10-12')).toBe('2026-10-12..2026-10-12');
    expect(range('last week', '2026-10-12')).toBe('2026-10-05..2026-10-11');
  });

  it('does not read a period into a question that names none', () => {
    expect(range('which suppliers deliver late')).toBeNull();
    expect(range('may I see the stock on hand')).toBeNull();
    expect(range('a report on marching orders')).toBeNull();
  });

  it('reads May as a month only when the question points at it', () => {
    expect(range('spend in May')).toBe('2026-05-01..2026-05-31');
    expect(range('spend May 2026')).toBe('2026-05-01..2026-05-31');
  });

  it('never reaches past today', () => {
    expect(range('received from 2026-10-01 to 2026-12-31')).toBe('2026-10-01..2026-10-11');
    expect(range('received on 2027-01-01')).toBeNull();
  });

  it('holds the model only when one period is named', () => {
    expect(singlePeriod('dispatch today', TODAY)).toMatchObject({ from: TODAY, to: TODAY, label: 'today' });
    expect(findPeriods('this month against last month', TODAY)).toHaveLength(2);
    expect(singlePeriod('this month against last month', TODAY)).toBeNull();
    expect(singlePeriod('which suppliers deliver late', TODAY)).toBeNull();
  });
});

describe('the keyword fallback uses the same periods', () => {
  it('answers a question about today for today', () => {
    expect(resolveDates('food dispatched today', TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it('keeps the last three months when no period is named', () => {
    expect(resolveDates('food dispatched', TODAY)).toEqual({ from: '2026-08-01', to: TODAY });
  });

  // The question that was answered with dispatch alone, since August.
  it('shows stock in and stock out together, for the day asked', () => {
    const m = matchQuestion(
      'Can you report to me the stock that was received today and the stock that left the warehouse through dispatch',
      TODAY,
    );
    expect(m.spec).toMatchObject({
      metric: 'stock_movement_volume',
      dimension: 'movement_type',
      dateRange: { from: TODAY, to: TODAY },
    });
  });

  it('breaks stock in and out down by product when asked', () => {
    const m = matchQuestion('which products were received and dispatched this week', TODAY);
    expect(m.spec).toMatchObject({ metric: 'stock_movement_volume', dimension: 'product' });
  });

  it('leaves a one-sided question on its own report', () => {
    expect(matchQuestion('food dispatched today', TODAY).spec.metric).toBe('dispatch_volume');
    expect(matchQuestion('goods received yesterday', TODAY).spec.metric).toBe('goods_received');
  });
});

describe('saved report periods match the page', () => {
  it.each([
    ['today', '2026-10-11', '2026-10-11'],
    ['yesterday', '2026-10-10', '2026-10-10'],
    ['this_week', '2026-10-05', '2026-10-11'],
    ['last_week', '2026-09-28', '2026-10-04'],
    ['last_7d', '2026-10-05', '2026-10-11'],
    ['last_30d', '2026-09-12', '2026-10-11'],
    ['this_month', '2026-10-01', '2026-10-11'],
  ])('%s', (preset, from, to) => {
    expect(presetRange(preset, TODAY)).toEqual({ from, to });
  });
});

describe('the model is held to the period in the question', () => {
  const catalog = {
    metrics: [
      { id: 'dispatch_volume', label: 'Food dispatched', temporal: 'range', filters: [], dimensions: ['month'] },
      { id: 'stock_on_hand', label: 'Stock on hand', temporal: 'snapshot', filters: [], dimensions: ['product'] },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider.isEnabled.mockReturnValue(true);
    reporting.todayISO.mockReturnValue(TODAY);
    reporting.getCatalog.mockReturnValue(catalog);
    reporting.runReport.mockImplementation(async (spec) => ({ spec, series: [], total: 0, meta: {} }));
  });

  it('replaces a wider range the model sent', async () => {
    provider.callWithTools.mockResolvedValue({
      name: 'run_report',
      args: { metric: 'dispatch_volume', dimension: 'month', date_from: '2026-08-01', date_to: '2026-10-11' },
    });
    const out = await ask({ question: 'food dispatched today', userId: 1 });
    expect(reporting.runReport.mock.calls[0][0].dateRange).toEqual({ from: TODAY, to: TODAY });
    expect(out.meta.period).toBe('today');
  });

  it('fills in the period when the model sent no dates', async () => {
    provider.callWithTools.mockResolvedValue({ name: 'run_report', args: { metric: 'dispatch_volume', dimension: 'month' } });
    const out = await ask({ question: 'food dispatched yesterday', userId: 1 });
    expect(reporting.runReport.mock.calls[0][0].dateRange).toEqual({ from: '2026-10-10', to: '2026-10-10' });
    expect(out.meta.defaultedRange).toBeUndefined();
  });

  it('leaves the model its own dates when the question names no period', async () => {
    provider.callWithTools.mockResolvedValue({
      name: 'run_report',
      args: { metric: 'dispatch_volume', dimension: 'month', date_from: '2026-06-01', date_to: '2026-06-30' },
    });
    await ask({ question: 'food dispatched in the second quarter', userId: 1 });
    expect(reporting.runReport.mock.calls[0][0].dateRange).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('sends no dates to a live report', async () => {
    provider.callWithTools.mockResolvedValue({ name: 'run_report', args: { metric: 'stock_on_hand', dimension: 'product' } });
    const out = await ask({ question: 'what stock do we have today', userId: 1 });
    expect(reporting.runReport.mock.calls[0][0].dateRange).toBeUndefined();
    expect(out.meta.period).toBeUndefined();
  });

  it('holds a custom report and a comparison to it as well', async () => {
    provider.callWithTools.mockResolvedValue({
      name: 'run_custom_report',
      args: { dataset: 'stock_movements', group_by: 'type', date_from: '2026-08-01', date_to: '2026-10-11' },
    });
    await ask({ question: 'stock movements by type this week', userId: 1 });
    expect(reporting.runReport.mock.calls[0][0].dateRange).toEqual({ from: '2026-10-05', to: TODAY });

    insight.runComparison.mockResolvedValue({ type: 'comparison', id: 'packer_workload_vs_flags' });
    provider.callWithTools.mockResolvedValue({ name: 'run_comparison', args: { comparison: 'packer_workload_vs_flags' } });
    await ask({ question: 'packers workload against flags last week', userId: 1 });
    expect(insight.runComparison.mock.calls[0][0].dateRange).toEqual({ from: '2026-09-28', to: '2026-10-04' });
  });

  it('widens a one-sided answer when the question asks for stock in and out', async () => {
    reporting.getCatalog.mockReturnValue({
      metrics: [...catalog.metrics,
        { id: 'stock_movement_volume', label: 'Stock movements', temporal: 'range', filters: [], dimensions: ['movement_type'] }],
    });
    provider.callWithTools.mockResolvedValue({ name: 'run_report', args: { metric: 'dispatch_volume', dimension: 'month' } });
    await ask({ question: 'stock received today and stock that left the warehouse', userId: 1 });
    expect(reporting.runReport.mock.calls[0][0]).toMatchObject({
      metric: 'stock_movement_volume', dimension: 'movement_type', dateRange: { from: TODAY, to: TODAY },
    });
  });

  it('answers from the keywords for the day asked when the AI is down', async () => {
    provider.callWithTools.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    await ask({ question: 'stock received today and stock dispatched', userId: 1 });
    expect(reporting.runReport.mock.calls[0][0]).toMatchObject({
      metric: 'stock_movement_volume', dimension: 'movement_type', dateRange: { from: TODAY, to: TODAY },
    });
  });
});
