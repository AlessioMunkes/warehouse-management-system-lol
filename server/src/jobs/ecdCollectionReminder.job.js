import reminderService from '../services/ecdCollectionReminder.service.js';

const JOB_NAME = 'ecd_collection_email_reminders';
const SAST_OFFSET_HOURS = 2;
const RUN_HOUR_SAST = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateStringInZone = (date, timeZone = 'Africa/Johannesburg') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

export const nextRunAt = (now = new Date()) => {
  const [year, month, day] = dateStringInZone(now).split('-').map(Number);
  let runAt = new Date(Date.UTC(year, month - 1, day, RUN_HOUR_SAST - SAST_OFFSET_HOURS, 0, 0, 0));

  if (runAt <= now) {
    runAt = new Date(runAt.getTime() + DAY_MS);
  }

  return runAt;
};

export const runEmailReminderJob = async ({
  now = new Date(),
  logger = console,
  service = reminderService,
} = {}) => {
  logger.info(`[${JOB_NAME}] start`, { at: now.toISOString() });

  try {
    const result = await service.sendTomorrowCollectionReminderEmails({ now });
    logger.info(`[${JOB_NAME}] result`, {
      collectionDate: result.collectionDate,
      queuedCreated: result.queued?.created,
      queuedSkipped: result.queued?.skipped,
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    });
    return result;
  } catch (err) {
    logger.error(`[${JOB_NAME}] error`, {
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }
};

export const startEmailReminderScheduler = ({
  logger = console,
  service = reminderService,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  nowFn = () => new Date(),
} = {}) => {
  let timer = null;
  let stopped = false;
  let running = false;

  const scheduleNext = () => {
    if (stopped) return;
    const now = nowFn();
    const runAt = nextRunAt(now);
    const delay = Math.max(0, runAt.getTime() - now.getTime());

    logger.info(`[${JOB_NAME}] scheduled`, { runAt: runAt.toISOString() });
    timer = setTimer(async () => {
      if (running) {
        logger.info(`[${JOB_NAME}] skipped`, { reason: 'previous run still active' });
        scheduleNext();
        return;
      }

      running = true;
      try {
        await runEmailReminderJob({ now: nowFn(), logger, service });
      } catch {
        // runEmailReminderJob already logs the error. The scheduler must
        // continue so one failed Gmail/provider attempt does not disable
        // all future reminders.
      } finally {
        running = false;
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
    },
  };
};

export default {
  nextRunAt,
  runEmailReminderJob,
  startEmailReminderScheduler,
};
