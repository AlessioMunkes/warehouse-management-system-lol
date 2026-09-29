// ─────────────────────────────────────────────────────────────
// server/src/jobs/savedReports.job.js
//
// Emails scheduled reports. Checks once an hour; whether a report is due
// comes from its last_sent_at, so a restart never sends twice and a
// missed day is caught up. Runs once per warehouse in multi-warehouse mode.
// ─────────────────────────────────────────────────────────────
import savedReportService from '../services/savedReport.service.js';
import { runInWarehouse } from '../config/warehouseContext.js';
import { warehouseCodes } from '../config/warehouses.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let intervalHandle = null;
let running = false;

const warehouses = () => {
  const codes = warehouseCodes();
  return codes.length ? codes : [null];
};

const sweep = async () => {
  if (running) return;
  running = true;
  try {
    for (const code of warehouses()) {
      const where = code ? ` [${code}]` : '';
      try {
        const s = code
          ? await runInWarehouse(code, () => savedReportService.sendDue())
          : await savedReportService.sendDue();
        if (s.sent || s.failed) console.log(`[savedReports]${where} sent ${s.sent}, failed ${s.failed}`);
      } catch (err) {
        console.error(`[savedReports]${where} sweep failed:`, err.message);
      }
    }
  } finally {
    running = false;
  }
};

const startSavedReportsJob = () => {
  if (intervalHandle) return;
  sweep();
  intervalHandle = setInterval(sweep, CHECK_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
};

const stopSavedReportsJob = () => {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
};

export default { startSavedReportsJob, stopSavedReportsJob, sweep };
