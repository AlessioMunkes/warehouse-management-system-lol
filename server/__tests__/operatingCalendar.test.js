// ─────────────────────────────────────────────────────────────
// server/__tests__/operatingCalendar.test.js
//
// The operating calendar (features/calendar): South Africa's public
// holidays, the rules for closed days and cohort collection days, and
// the three places that must respect a closed day — collection
// reminders, the non-collection sweep and picking slip generation.
//
// calendar.repository.js is stubbed in setup.js ("always open");
// tests here say when a day is closed.
// ─────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from '../src/middleware/auth.middleware.js';

const reminderRepo = {
  findCollectionsByDate: vi.fn(), listPendingReminderDeliveries: vi.fn(), listReminderDeliveries: vi.fn(),
  getReminderDeliveryById: vi.fn(), createReminderOnce: vi.fn(), claimReminderForSending: vi.fn(),
  markReminderSent: vi.fn(), markReminderFailed: vi.fn(),
};
const dispatchRepo = { sweepNonCollections: vi.fn(), getBoard: vi.fn() };
const pickingRepo = { generateSlips: vi.fn(), createSlip: vi.fn() };

vi.mock('../src/repositories/ecdCollectionReminder.repository.js', () => ({ default: reminderRepo }));
vi.mock('../src/repositories/dispatch.repository.js', () => ({ default: dispatchRepo }));
vi.mock('../src/repositories/picking.repository.js', () => ({ default: pickingRepo }));

const { saPublicHolidays, easterSunday } = await import('../src/features/calendar/saPublicHolidays.js');
const { default: calendar } = await import('../src/features/calendar/calendar.service.js');
const { default: repo } = await import('../src/features/calendar/calendar.repository.js');
const { default: settings } = await import('../src/features/settings/settings.service.js');
const { default: reminders } = await import('../src/services/ecdCollectionReminder.service.js');
const { default: dispatch } = await import('../src/services/dispatch.service.js');
const { default: picking } = await import('../src/services/picking.service.js');

const MANAGER = { id: 20, role: ROLES.MANAGER };
const HERITAGE = { id: 7, date: '2026-09-24', kind: 'public_holiday', label: 'Heritage Day' };

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByDate.mockResolvedValue(null);
  reminderRepo.findCollectionsByDate.mockResolvedValue([{ ecd_id: 1 }]);
  reminderRepo.createReminderOnce.mockResolvedValue({ id: 1 });
  reminderRepo.listPendingReminderDeliveries.mockResolvedValue([]);
  reminderRepo.listReminderDeliveries.mockResolvedValue([]);
  dispatchRepo.sweepNonCollections.mockResolvedValue({ flagged: 0, slipIds: [] });
  dispatchRepo.getBoard.mockResolvedValue([]);
  pickingRepo.generateSlips.mockResolvedValue({ created: [], emptySlips: [] });
});
afterEach(() => vi.useRealTimers());

describe('South Africa’s public holidays', () => {
  it('works out Easter', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('lists the twelve days, Easter ones included', () => {
    const days = saPublicHolidays(2026);
    const byLabel = Object.fromEntries(days.map((d) => [d.label, d.date]));
    expect(byLabel['Good Friday']).toBe('2026-04-03');
    expect(byLabel['Family Day']).toBe('2026-04-06');
    expect(byLabel['Heritage Day']).toBe('2026-09-24');
    expect(days.filter((d) => !d.label.includes('observed'))).toHaveLength(12);
  });

  it('gives the Monday off when a holiday falls on a Sunday', () => {
    // 9 August 2026 and 26 December 2027 are Sundays.
    expect(saPublicHolidays(2026)).toContainEqual({ date: '2026-08-10', label: 'National Women’s Day (observed)' });
    expect(saPublicHolidays(2027)).toContainEqual({ date: '2027-12-27', label: 'Day of Goodwill (observed)' });
  });

  it('keeps them in date order', () => {
    const dates = saPublicHolidays(2027).map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe('the calendar’s own rules', () => {
  it('closes every day of a range, and says how many were already closed', async () => {
    repo.insertMany.mockImplementationOnce(async (days) => days.slice(1));
    const result = await calendar.addClosure(
      { date: '2026-12-21', endDate: '2026-12-23', kind: 'closure', label: 'Year-end shutdown' }, MANAGER,
    );
    expect(repo.insertMany).toHaveBeenCalledWith([
      { date: '2026-12-21', kind: 'closure', label: 'Year-end shutdown' },
      { date: '2026-12-22', kind: 'closure', label: 'Year-end shutdown' },
      { date: '2026-12-23', kind: 'closure', label: 'Year-end shutdown' },
    ], MANAGER.id);
    expect(result.alreadyClosed).toBe(1);
  });

  it.each([
    [{ date: '2026-02-30', label: 'x' }, /date/],
    [{ date: '2026-12-21', label: '' }, /why/],
    [{ date: '2026-12-21', endDate: '2026-12-20', label: 'x' }, /before/],
    [{ date: '2026-12-21', label: 'x', kind: 'party' }, /public holiday or closure/],
  ])('refuses %j', async (body, message) => {
    await expect(calendar.addClosure(body, MANAGER)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(message) });
  });

  it('adds a year’s public holidays as public holidays', async () => {
    await calendar.addPublicHolidays({ year: 2026 }, MANAGER);
    const [days] = repo.insertMany.mock.calls[0];
    expect(days.every((d) => d.kind === 'public_holiday')).toBe(true);
    expect(days.map((d) => d.date)).toContain('2026-12-25');
  });

  it('collects Tuesday and Thursday unless changed', async () => {
    expect(await calendar.cohortForDate('2026-08-04')).toBe('tuesday');
    expect(await calendar.cohortForDate('2026-08-06')).toBe('thursday');
    expect(await calendar.cohortForDate('2026-08-05')).toBeNull();
  });

  it('saves both cohort days together, so they can swap', async () => {
    await calendar.setCohortDays({ tuesday: 3, thursday: 5 }, MANAGER);
    expect(settings.update).toHaveBeenCalledWith(
      { 'calendar.tuesdayCohortWeekday': 3, 'calendar.thursdayCohortWeekday': 5 }, MANAGER.id,
    );
  });

  it('refuses a Sunday collection day', async () => {
    await expect(calendar.setCohortDays({ tuesday: 7 }, MANAGER)).rejects.toMatchObject({ status: 400 });
  });

  it('says plainly when the calendar table has not been created yet', async () => {
    repo.list.mockRejectedValueOnce(Object.assign(new Error('relation "operating_closures" does not exist'), { code: '42P01' }));
    await expect(calendar.getCalendar()).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/migration 034/) });
  });

  it('treats the day as open if the calendar cannot be read', async () => {
    repo.findByDate.mockRejectedValueOnce(new Error('relation does not exist'));
    expect(await calendar.closureOn('2026-09-24')).toBeNull();
  });
});

describe('a closed day is respected', () => {
  it('sends no collection reminders for a closed collection day', async () => {
    repo.findByDate.mockResolvedValue(HERITAGE);
    const result = await reminders.sendTomorrowCollectionReminderEmails({ now: new Date('2026-09-23T06:00:00Z') });
    expect(result).toMatchObject({ collectionDate: '2026-09-24', closed: HERITAGE, sent: 0 });
    expect(reminderRepo.findCollectionsByDate).not.toHaveBeenCalled();
    expect(reminderRepo.listPendingReminderDeliveries).not.toHaveBeenCalled();
  });

  it('shows no WhatsApp reminders for it either, and says why', async () => {
    repo.findByDate.mockResolvedValue(HERITAGE);
    const result = await reminders.listTomorrowWhatsAppReminders({ now: new Date('2026-09-23T06:00:00Z') });
    expect(result).toMatchObject({ closed: HERITAGE, reminders: [] });
  });

  it('still reminds for an open day', async () => {
    await reminders.sendTomorrowCollectionReminderEmails({ now: new Date('2026-09-22T06:00:00Z') });
    expect(reminderRepo.findCollectionsByDate).toHaveBeenCalledWith('2026-09-23');
  });

  it('does not write off pallets due on a closed day when the board is opened', async () => {
    repo.findByDate.mockResolvedValue(HERITAGE);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T08:00:00Z'));
    await dispatch.getBoard({ dispatchDate: '2026-09-24' }, MANAGER);
    expect(dispatchRepo.sweepNonCollections).not.toHaveBeenCalled();
  });

  it('refuses a manual sweep of a closed day, saying why', async () => {
    repo.findByDate.mockResolvedValue(HERITAGE);
    await expect(dispatch.sweep({ dispatchDate: '2026-09-24' }, MANAGER))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/closed on 2026-09-24 \(Heritage Day\)/) });
  });

  it('refuses to generate a cohort’s slips for a closed day', async () => {
    repo.findByDate.mockResolvedValue(HERITAGE);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T08:00:00Z'));
    await expect(picking.generateSlips({ dispatchDate: '2026-09-24', cohort: 'thursday' }, MANAGER))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/closed on 2026-09-24/) });
    expect(pickingRepo.generateSlips).not.toHaveBeenCalled();
  });

  it('follows a cohort that has moved to another weekday', async () => {
    const moved = { ...(await settings.getAll()), 'calendar.thursdayCohortWeekday': 5 };
    settings.getAll.mockResolvedValueOnce(moved).mockResolvedValueOnce(moved);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T08:00:00Z'));
    // Thursday 24 September is no longer the Thursday cohort's day.
    await expect(picking.generateSlips({ dispatchDate: '2026-09-24', cohort: 'thursday' }, MANAGER))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/collects on Friday/) });
  });
});
