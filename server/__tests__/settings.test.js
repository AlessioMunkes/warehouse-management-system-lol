// ─────────────────────────────────────────────────────────────
// server/__tests__/settings.test.js
//
// features/settings: defaults equal the constants they replaced,
// reads fall back to them, saves are checked against each other, and
// the callers use what is saved.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

// setup.js stubs the service for every file; this one tests it.
vi.unmock('../src/services/settings.service.js');

const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
const poolMock = { query: vi.fn(), connect: vi.fn(async () => client) };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: settings } = await import('../src/services/settings.service.js');
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
      // Sign-in lengths (were STAFF_SESSION_HOURS and the guest
      // SESSION_HOURS): 8 hours for staff, 12 for volunteers.
      'accounts.staffSessionHours': 8,
      'accounts.guestSessionHours': 12,
      // Were GUEST_IDLE_HOURS, REPORT_LINK_DAYS and IDLE_KIT_MONTHS.
      'accounts.guestIdleHours': 4,
      'finance.reportLinkDays': 30,
      'feedTheSoil.idleKitMonths': 3,
      // Organisation: the letterhead (was VITE_WAREHOUSE_NAME / _ADDRESS)
      // and the Section 18A threshold (was only in donation_settings).
      'documents.letterheadName': 'Ladles of Love, Cape Town Warehouse',
      'documents.letterheadAddress': 'Unit 4, Hewett Park\n17 Hewett Ave, Epping\nCape Town, 7460',
      'donations.section18aThreshold': 1000,
      // The operating calendar's cohort days (were picking.service's
      // fixed WEEKDAY_FOR_COHORT): Tuesday and Thursday, 1 = Monday.
      'calendar.tuesdayCohortWeekday': 2,
      'calendar.thursdayCohortWeekday': 4,
      // New with recipes, not a replaced constant: centres are supplied
      // in bands of five children.
      'recipes.childBand': 5,
      // Loose products round up to whole units (feedback: 3.3 L of oil
      // on a slip should be 4 L). Was a fixed two decimals.
      'recipes.loosePlaces': 0,
      // New with unit sizes: 0 is "not set", so no unit is converted
      // until an admin says what one weighs.
      'units.crateKg': 0,
      'units.bagKg': 0,
      'units.boxKg': 0,
      'units.punnetGrams': 0,
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

describe('wording and organisation settings', async () => {
  const { validateValue, SETTINGS } = await import('../src/features/settings/settingsDefinitions.js');

  it('takes text for the letterhead, and refuses empty or over-long text', () => {
    expect(validateValue('documents.letterheadName', 'Ladles of Love, Gauteng')).toBeNull();
    expect(validateValue('documents.letterheadName', '   ')).toMatch(/cannot be empty/);
    expect(validateValue('documents.letterheadName', 5)).toMatch(/cannot be empty/);
    expect(validateValue('documents.letterheadName', 'x'.repeat(121))).toMatch(/at most 120/);
    expect(validateValue('documents.letterheadAddress', 'Line 1\nLine 2')).toBeNull();
  });

  it('keeps whole numbers for the rest, including the Section 18A threshold', () => {
    expect(validateValue('donations.section18aThreshold', 2500)).toBeNull();
    expect(validateValue('donations.section18aThreshold', 99.5)).toMatch(/whole number/);
    expect(validateValue('donations.section18aThreshold', -1)).toMatch(/from 0/);
  });

  it('will not sign a volunteer out for idling later than their sign-in ends', () => {
    const all = { ...defaults(), 'accounts.guestSessionHours': 3 };
    expect(SETTINGS['accounts.guestIdleHours'].check(4, all)).toMatch(/cannot be longer/);
    expect(SETTINGS['accounts.guestSessionHours'].check(3, { ...defaults(), 'accounts.guestIdleHours': 4 })).toMatch(/cannot be shorter/);
    expect(SETTINGS['accounts.guestIdleHours'].check(2, all)).toBeNull();
  });
});
