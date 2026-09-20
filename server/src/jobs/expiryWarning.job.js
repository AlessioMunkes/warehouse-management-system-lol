// ─────────────────────────────────────────────────────────────
// server/src/jobs/expiryWarning.job.js
//
// Runs expiryWarningService.runExpiryCheck() once a day. No new
// dependency (no node-cron) — the server is a single always-on
// process, so a plain setInterval that checks "have I already run
// today?" against an in-memory date is enough, and the check itself
// is idempotent (warningAlreadySent), so a double-run from a restart
// or a missed tick is harmless.
// ─────────────────────────────────────────────────────────────
import expiryWarningService from '../services/expiryWarning.service.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // look once an hour; only act once/day

let lastRunDate = null;
let intervalHandle = null;

const todayKey = () => new Date().toISOString().slice(0, 10);

const runIfDue = async () => {
  const today = todayKey();
  if (lastRunDate === today) return;
  lastRunDate = today;

  try {
    const summary = await expiryWarningService.runExpiryCheck();
    console.log(`[expiryWarning] checked ${summary.checked}, notified ${summary.notified}`);
  } catch (err) {
    // A failed sweep shouldn't crash the server or wedge future days —
    // reset so the next hourly tick retries today instead of waiting
    // until tomorrow.
    lastRunDate = null;
    console.error('[expiryWarning] sweep failed:', err.message);
  }
};

const startExpiryWarningJob = () => {
  if (intervalHandle) return; // already started
  runIfDue();
  intervalHandle = setInterval(runIfDue, CHECK_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
};

const stopExpiryWarningJob = () => {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  lastRunDate = null;
};

export default { startExpiryWarningJob, stopExpiryWarningJob };
