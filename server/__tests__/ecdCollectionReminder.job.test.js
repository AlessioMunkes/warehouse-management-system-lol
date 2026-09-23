import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMock = {
  sendTomorrowCollectionReminderEmails: vi.fn(),
};

vi.mock('../src/services/ecdCollectionReminder.service.js', () => ({ default: serviceMock }));

const {
  nextRunAt,
  runEmailReminderJob,
  startEmailReminderScheduler,
} = await import('../src/jobs/ecdCollectionReminder.job.js');

const logger = () => ({
  info: vi.fn(),
  error: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.sendTomorrowCollectionReminderEmails.mockResolvedValue({
    collectionDate: '2026-09-24',
    queued: { created: 1, skipped: 2 },
    attempted: 1,
    sent: 1,
    failed: 0,
    skipped: 0,
  });
});

describe('ECD collection reminder scheduler timing', () => {
  it('runs at the next 08:00 Africa/Johannesburg when today has not passed', () => {
    const runAt = nextRunAt(new Date('2026-09-23T05:59:00.000Z'));

    expect(runAt.toISOString()).toBe('2026-09-23T06:00:00.000Z');
  });

  it('schedules tomorrow when 08:00 Africa/Johannesburg has passed', () => {
    const runAt = nextRunAt(new Date('2026-09-23T06:00:00.000Z'));

    expect(runAt.toISOString()).toBe('2026-09-24T06:00:00.000Z');
  });
});

describe('runEmailReminderJob', () => {
  it('logs start and result while calling the existing reminder sender', async () => {
    const log = logger();
    const now = new Date('2026-09-23T06:00:00.000Z');

    const result = await runEmailReminderJob({ now, logger: log, service: serviceMock });

    expect(serviceMock.sendTomorrowCollectionReminderEmails).toHaveBeenCalledWith({ now });
    expect(log.info).toHaveBeenCalledWith(
      '[ecd_collection_email_reminders] start',
      { at: '2026-09-23T06:00:00.000Z' }
    );
    expect(log.info).toHaveBeenCalledWith(
      '[ecd_collection_email_reminders] result',
      expect.objectContaining({ sent: 1, failed: 0, collectionDate: '2026-09-24' })
    );
    expect(result.sent).toBe(1);
  });

  it('logs and rethrows errors so operators can see failures', async () => {
    const log = logger();
    const err = new Error('Gmail down');
    serviceMock.sendTomorrowCollectionReminderEmails.mockRejectedValueOnce(err);

    await expect(runEmailReminderJob({
      now: new Date('2026-09-23T06:00:00.000Z'),
      logger: log,
      service: serviceMock,
    })).rejects.toThrow('Gmail down');

    expect(log.error).toHaveBeenCalledWith(
      '[ecd_collection_email_reminders] error',
      expect.objectContaining({ message: 'Gmail down' })
    );
  });
});

describe('startEmailReminderScheduler', () => {
  it('schedules the first run for 08:00 SAST and can be stopped', () => {
    const log = logger();
    const setTimer = vi.fn(() => 123);
    const clearTimer = vi.fn();

    const scheduler = startEmailReminderScheduler({
      logger: log,
      service: serviceMock,
      setTimer,
      clearTimer,
      nowFn: () => new Date('2026-09-23T05:30:00.000Z'),
    });

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 30 * 60 * 1000);
    expect(log.info).toHaveBeenCalledWith(
      '[ecd_collection_email_reminders] scheduled',
      { runAt: '2026-09-23T06:00:00.000Z' }
    );

    scheduler.stop();
    expect(clearTimer).toHaveBeenCalledWith(123);
  });

  it('runs the job and reschedules even after service errors', async () => {
    const log = logger();
    const callbacks = [];
    const setTimer = vi.fn((fn) => {
      callbacks.push(fn);
      return callbacks.length;
    });
    serviceMock.sendTomorrowCollectionReminderEmails.mockRejectedValueOnce(new Error('Gmail down'));

    startEmailReminderScheduler({
      logger: log,
      service: serviceMock,
      setTimer,
      clearTimer: vi.fn(),
      nowFn: () => new Date('2026-09-23T06:00:00.000Z'),
    });

    await callbacks[0]();

    expect(serviceMock.sendTomorrowCollectionReminderEmails).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      '[ecd_collection_email_reminders] error',
      expect.objectContaining({ message: 'Gmail down' })
    );
    expect(setTimer).toHaveBeenCalledTimes(2);
  });
});
