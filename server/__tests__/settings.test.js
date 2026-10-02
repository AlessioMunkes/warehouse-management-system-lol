// ─────────────────────────────────────────────────────────────
// server/__tests__/settings.test.js
//
// features/settings: defaults equal the constants they replaced,
// reads fall back to them, saves are checked against each other, and
// the callers use what is saved.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

// setup.js stubs the service for every file; this one tests it.
vi.unmock('../src/features/settings/settings.service.js');

const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
const poolMock = { query: vi.fn(), connect: vi.fn(async () => client) };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: settings } = await import('../src/features/settings/settings.service.js');
const { defaults } = await import('../src/features/settings/settingsDefinitions.js');
const { NON_COLLECTION_CUTOFF_HOUR } = await import('../src/services/dispatch.service.js');
const { nextRunAt } = await import('../src/jobs/ecdCollectionReminder.job.js');

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockResolvedValue({ rows: [] });
  client.query.mockResolvedValue({ rows: [] });
});

describe('defaults', () => {
  it('are the constants each setting replaced', () => {
    expect(defaults()).toEqual({
      'dispatch.nonCollectionCutoffHour': NON_COLLECTION_CUTOFF_HOUR,   // 15
      'reminders.runHour': 8,
      'stock.expiryWarningFirstDays': 14,
      'stock.expiryWarningSecondDays': 7,
      'invites.linkDays': 7,
    });
    // The reminder job's own default still lands on 08:00 SAST.
    expect(nextRunAt(new Date('2026-09-23T05:00:00Z')).toISOString()).toBe('2026-09-23T06:00:00.000Z');
  });
});

describe('reading', () => {
  it('uses a saved value over the default', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ key: 'dispatch.nonCollectionCutoffHour', value: 16 }] });
    expect(await settings.get('dispatch.nonCollectionCutoffHour')).toBe(16);
  });

  it('falls back to the defaults when the table cannot be read', async () => {
    poolMock.query.mockRejectedValue(new Error('relation "app_settings" does not exist'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await settings.getAll()).toEqual(defaults());
    spy.mockRestore();
  });

  it('ignores a stored value that is no longer valid', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ key: 'reminders.runHour', value: 99 }, { key: 'gone.setting', value: 1 }] });
    expect(await settings.getAll()).toEqual(defaults());
  });

  it('lists each setting with its section and whether it is the default, without the check function', async () => {
    const rows = await settings.list();
    const cutoff = rows.find((r) => r.key === 'dispatch.nonCollectionCutoffHour');
    expect(cutoff).toMatchObject({ section: 'notifications', value: 15, isDefault: true, min: 0, max: 23 });
    expect(rows.find((r) => r.key === 'stock.expiryWarningFirstDays')).not.toHaveProperty('check');
  });
});

describe('saving', () => {
  it.each([
    [{ 'reminders.runHour': 24 }, /from 0 to 23/],
    [{ 'invites.linkDays': 2.5 }, /whole number/],
    [{ 'no.such': 1 }, /Unknown setting/],
    [{}, /Nothing to change/],
  ])('refuses %j', async (changes, message) => {
    await expect(settings.update(changes, 1)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(message) });
    expect(poolMock.connect).not.toHaveBeenCalled();
  });

  it('keeps the first expiry warning before the second', async () => {
    await expect(settings.update({ 'stock.expiryWarningSecondDays': 14 }, 1))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/second warning has to come after the first/) });
    // Both moved together is fine.
    await expect(settings.update({ 'stock.expiryWarningFirstDays': 30, 'stock.expiryWarningSecondDays': 14 }, 1)).resolves.toBeTruthy();
  });

  it('writes a changed value, and removes the row when set back to the default', async () => {
    await settings.update({ 'reminders.runHour': 9, 'invites.linkDays': 7 }, 5);
    const sql = client.query.mock.calls.map(([q, p]) => [q.replace(/\s+/g, ' ').trim(), p]);
    expect(sql.find(([q]) => q.startsWith('INSERT INTO app_settings'))[1]).toEqual(['reminders.runHour', '9', 5]);
    expect(sql.find(([q]) => q.startsWith('DELETE FROM app_settings'))[1]).toEqual(['invites.linkDays']);
    expect(sql.map(([q]) => q)).toContain('COMMIT');
  });
});
