// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.saved.test.js
//
// Saved and scheduled reports: the periods a schedule covers, when
// one is due (never twice, and caught up after a missed day), what
// may be saved, and that the email goes only to the owner.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { periodFor, isDue, presetRange, emailFor } from '../src/features/reporting/savedReports.js';

describe('schedule periods', () => {
  it('weekly covers last Monday to Sunday', () => {
    // 2026-09-27 is a Sunday; the last full week is 14–20 September.
    expect(periodFor('weekly', '2026-09-27')).toMatchObject({ from: '2026-09-14', to: '2026-09-20' });
    expect(periodFor('weekly', '2026-09-28')).toMatchObject({ from: '2026-09-21', to: '2026-09-27' });
  });

  it('monthly covers the last calendar month, across a year end', () => {
    expect(periodFor('monthly', '2026-09-27')).toMatchObject({ from: '2026-08-01', to: '2026-08-31', label: 'August 2026' });
    expect(periodFor('monthly', '2027-01-03')).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('page presets resolve like the page does', () => {
    expect(presetRange('last_3m', '2026-09-27')).toEqual({ from: '2026-07-01', to: '2026-09-27' });
    expect(presetRange('last_month', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('when a scheduled report is due', () => {
  it('is due once its period has ended since it last went', () => {
    expect(isDue({ schedule: 'weekly', last_sent_at: null }, '2026-09-28')).toBe(true);
    expect(isDue({ schedule: 'weekly', last_sent_at: '2026-09-21T06:00:00Z' }, '2026-09-28')).toBe(true);
    expect(isDue({ schedule: 'weekly', last_sent_at: '2026-09-28T06:00:00Z' }, '2026-09-28')).toBe(false);
  });

  it('catches up a missed day, and never sends a monthly one twice', () => {
    expect(isDue({ schedule: 'monthly', last_sent_at: '2026-08-01T06:00:00Z' }, '2026-09-03')).toBe(true);
    expect(isDue({ schedule: 'monthly', last_sent_at: '2026-09-01T06:00:00Z' }, '2026-09-27')).toBe(false);
    expect(isDue({ schedule: 'none', last_sent_at: null }, '2026-09-27')).toBe(false);
  });
});

describe('the email', () => {
  it('has the figures, escapes what it prints, and links back', () => {
    const { subject, html, text } = emailFor({
      saved: { title: 'Weekly <dispatch>' },
      result: { description: 'Food dispatched, by week', total: 120, meta: { unit: 'kg', caveat: 'Kilogram lines only.' },
        series: [{ label: 'recipe_food', value: 100 }, { label: '<b>x</b>', value: 20 }] },
      period: { from: '2026-09-14', to: '2026-09-20', label: 'the week of 2026-09-14' },
      appUrl: 'https://batches.example/',
    });
    expect(subject).toBe('Weekly <dispatch>: the week of 2026-09-14');
    expect(html).toContain('Weekly &lt;dispatch&gt;');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('Recipe food');
    expect(html).toContain('https://batches.example/noc/reporting');
    expect(text).toMatch(/Total: 120 kg/);
  });
});

// ── The service, with the database and email faked ──────────
const repoMock = {
  listForUser: vi.fn(), countForUser: vi.fn(async () => 0), create: vi.fn(async (r) => ({ id: 1, ...r })),
  update: vi.fn(), remove: vi.fn(), getForUser: vi.fn(), listScheduled: vi.fn(), markSent: vi.fn(async () => {}),
};
const emailMock = { sendEmail: vi.fn(async () => ({ sent: true })) };
const reportingMock = { runReport: vi.fn(async () => ({ description: 'd', total: 1, series: [{ label: 'a', value: 1 }], meta: {} })), todayISO: () => '2026-09-28' };
vi.mock('../src/repositories/savedReport.repository.js', () => ({ default: repoMock }));
vi.mock('../src/providers/email.provider.js', () => ({ default: emailMock }));
vi.mock('../src/services/reporting.service.js', () => ({ default: reportingMock }));
vi.mock('../src/services/reportingInsight.service.js', () => ({ default: { runComparison: vi.fn() } }));

const { default: service } = await import('../src/services/savedReport.service.js');

describe('saving', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps what to run and drops the dates', async () => {
    const row = await service.create(7, {
      kind: 'report', title: '  Discrepancies  by supplier ',
      spec: { metric: 'receiving_discrepancy_rate', dimension: 'supplier', filters: {}, dateRange: { from: '2026-01-01', to: '2026-02-01' } },
      schedule: 'weekly',
    });
    expect(repoMock.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7, title: 'Discrepancies by supplier', schedule: 'weekly', preset: 'last_3m',
      spec: { metric: 'receiving_discrepancy_rate', dimension: 'supplier', filters: {} },
    }));
    expect(row.id).toBe(1);
  });

  it('refuses a report that would not run, an unknown schedule, and a 21st save', async () => {
    await expect(service.create(7, { kind: 'report', title: 'x', spec: { metric: 'nope', dimension: 'month' } })).rejects.toMatchObject({ status: 400 });
    await expect(service.create(7, { kind: 'report', title: 'x', spec: { metric: 'dispatch_volume', dimension: 'month' }, schedule: 'hourly' })).rejects.toMatchObject({ status: 400 });
    await expect(service.create(7, { kind: 'comparison', title: 'x', spec: { comparison: 'made_up' } })).rejects.toMatchObject({ status: 400 });
    repoMock.countForUser.mockResolvedValueOnce(20);
    await expect(service.create(7, { kind: 'report', title: 'x', spec: { metric: 'dispatch_volume', dimension: 'month' } })).rejects.toThrow(/up to 20/);
  });

  it('cannot touch another manager’s report', async () => {
    repoMock.update.mockResolvedValueOnce(null);
    await expect(service.update(7, 99, { pinned: true })).rejects.toMatchObject({ status: 404 });
    expect(repoMock.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, id: 99 }));
  });
});

describe('sending', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only due reports, only to their owner, and records each', async () => {
    repoMock.listScheduled.mockResolvedValueOnce([
      { id: 1, title: 'A', kind: 'report', spec: { metric: 'dispatch_volume', dimension: 'week', filters: {} }, schedule: 'weekly', last_sent_at: null, email: 'owner@ladles.org' },
      { id: 2, title: 'B', kind: 'report', spec: { metric: 'dispatch_volume', dimension: 'week', filters: {} }, schedule: 'weekly', last_sent_at: '2026-09-28T05:00:00Z', email: 'other@ladles.org' },
    ]);
    const s = await service.sendDue();
    expect(s).toEqual({ checked: 2, sent: 1, failed: 0 });
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailMock.sendEmail.mock.calls[0][0].to).toBe('owner@ladles.org');
    expect(reportingMock.runReport).toHaveBeenCalledWith(expect.objectContaining({ dateRange: { from: '2026-09-21', to: '2026-09-27' } }));
    expect(repoMock.markSent).toHaveBeenCalledWith({ id: 1 });
  });

  it('records a failure instead of stopping the sweep', async () => {
    repoMock.listScheduled.mockResolvedValueOnce([
      { id: 3, title: 'C', kind: 'report', spec: { metric: 'dispatch_volume', dimension: 'week', filters: {} }, schedule: 'monthly', last_sent_at: null, email: null },
    ]);
    const s = await service.sendDue();
    expect(s.failed).toBe(1);
    expect(repoMock.markSent).toHaveBeenCalledWith({ id: 3, error: expect.stringMatching(/no email address/) });
  });
});
