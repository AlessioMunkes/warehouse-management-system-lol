// ─────────────────────────────────────────────────────────────
// server/src/jobs/expiryWarning.job.js
//
// Runs expiryWarningService.runExpiryCheck() once a day. No new
// dependency (no node-cron) — the server is a single always-on
// process, so a plain setInterval that checks "have I already run
// today?" against an in-memory date is enough, and the check itself
// is idempotent (warningAlreadySent), so a double-run from a restart
// or a missed tick is harmless.
//
// Multi-warehouse (WAREHOUSE_DB_URLS set): the sweep runs once per
// warehouse per day, each inside that warehouse (runInWarehouse), so
// it reads and notifies that site's database only. A failure at one
// site is retried on the next tick without re-running the others.
// ─────────────────────────────────────────────────────────────
import expiryWarningService from '../services/expiryWarning.service.js';
import { runInWarehouse } from '../config/warehouseContext.js';
import { warehouseCodes } from '../config/warehouses.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // look once an hour; only act once/day

// Warehouse code -> date of its last successful-or-running sweep.
// Single-warehouse mode uses the one key ''.
const lastRunDate = new Map();
let intervalHandle = null;

const todayKey = () => new Date().toISOString().slice(0, 10);

// From the environment rather than db.js, so this module stays
// importable without a database (its tests mock only the service).
const warehouses = () => {
  const codes = warehouseCodes();
  return codes.length ? codes : [null];
};

const runIfDue = async () => {
  const today = todayKey();

  for (const code of warehouses()) {
    const key = code ?? '';
    if (lastRunDate.get(key) === today) continue;
    lastRunDate.set(key, today);
    const where = code ? ` [${code}]` : '';

    try {
      const summary = code
        ? await runInWarehouse(code, () => expiryWarningService.runExpiryCheck())
        : await expiryWarningService.runExpiryCheck();
      console.log(`[expiryWarning]${where} checked ${summary.checked}, notified ${summary.notified}`);
    } catch (err) {
      // A failed sweep shouldn't crash the server or wedge future days —
      // reset so the next hourly tick retries today instead of waiting
      // until tomorrow.
      lastRunDate.delete(key);
      console.error(`[expiryWarning]${where} sweep failed:`, err.message);
    }
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
  lastRunDate.clear();
};

export default { startExpiryWarningJob, stopExpiryWarningJob };
