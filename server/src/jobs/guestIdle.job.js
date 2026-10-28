// ─────────────────────────────────────────────────────────────
// server/src/jobs/guestIdle.job.js
//
// Signs out guest visits idle for four hours (migration 067).
//
// auth.middleware.js already ends an idle guest's session the next
// time they use the app. This catches the guest who left without
// signing out and never came back: every fifteen minutes, each visit
// with nothing done for four hours is signed out when the guest last
// did something, so it counts the hours they were here.
//
// Multi-warehouse (WAREHOUSE_DB_URLS set): the sweep runs in each
// warehouse (runInWarehouse). A failure at one site is retried on the
// next tick without stopping the others.
// ─────────────────────────────────────────────────────────────
import sessionRepo from '../repositories/session.repository.js';
import { runInWarehouse } from '../config/warehouseContext.js';
import { warehouseCodes } from '../config/warehouses.js';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
let intervalHandle = null;

const warehouses = () => {
  const codes = warehouseCodes();
  return codes.length ? codes : [null];
};

export const sweepIdleGuests = async () => {
  for (const code of warehouses()) {
    const where = code ? ` [${code}]` : '';
    try {
      const closed = code
        ? await runInWarehouse(code, () => sessionRepo.closeIdleGuestSessions())
        : await sessionRepo.closeIdleGuestSessions();
      if (closed > 0) console.log(`[guestIdle]${where} signed out ${closed} idle visit${closed === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(`[guestIdle]${where} sweep failed:`, err.message);
    }
  }
};

const startGuestIdleJob = () => {
  if (intervalHandle) return;
  sweepIdleGuests();
  intervalHandle = setInterval(sweepIdleGuests, SWEEP_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
};

const stopGuestIdleJob = () => {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
};

export default { startGuestIdleJob, stopGuestIdleJob, sweepIdleGuests };
