// ─────────────────────────────────────────────────────────────
// src/tests/ReportDateRanges.test.js
//
// The report period menu. The short periods (today, yesterday, this
// week) have to mean the same days here as on the server, which reads
// them out of a typed question (server periods.js).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RANGE_PRESETS, resolvePreset } from '../features/reporting/dateRanges';

// Sunday 11 October 2026, 10:00 in South Africa.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T08:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('report periods', () => {
  it.each([
    ['today', '2026-10-11', '2026-10-11'],
    ['yesterday', '2026-10-10', '2026-10-10'],
    ['this_week', '2026-10-05', '2026-10-11'],
    ['last_week', '2026-09-28', '2026-10-04'],
    ['last_7d', '2026-10-05', '2026-10-11'],
    ['last_30d', '2026-09-12', '2026-10-11'],
    ['this_month', '2026-10-01', '2026-10-11'],
    ['last_month', '2026-09-01', '2026-09-30'],
    ['last_3m', '2026-08-01', '2026-10-11'],
    ['this_year', '2026-01-01', '2026-10-11'],
  ])('%s', (id, from, to) => {
    expect(resolvePreset(id)).toEqual({ from, to });
  });

  it('offers every period it can resolve, shortest first', () => {
    expect(RANGE_PRESETS.map((p) => p.label)).toEqual([
      'Today', 'Yesterday', 'This week', 'Last week', 'Last 7 days', 'Last 30 days',
      'This month', 'Last month', 'Last 3 months', 'Last 6 months', 'This year', 'Custom range',
    ]);
  });

  it('is already tomorrow in South Africa after 22:00 UTC', () => {
    vi.setSystemTime(new Date('2026-10-11T22:30:00Z'));
    expect(resolvePreset('today')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(resolvePreset('this_week')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
  });
});
