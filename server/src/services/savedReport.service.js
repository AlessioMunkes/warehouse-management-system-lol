// ─────────────────────────────────────────────────────────────
// server/src/services/savedReport.service.js
//
// Saved and scheduled Operations reports. What is saved is checked
// the same way a report request is (validateSpec / validateCustom /
// the comparison list), so a saved report always runs. A scheduled
// one is emailed to its owner only, from the organisation's Gmail
// account, covering the last full week or month
// (features/reporting/savedReports.js).
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/savedReport.repository.js';
import reportingService from './reporting.service.js';
import insightService from './reportingInsight.service.js';
import emailProvider from '../providers/email.provider.js';
import { validateSpec } from '../features/reporting/specValidator.js';
import { validateCustom } from '../features/reporting/customQuery.js';
import { getComparison } from '../features/reporting/reportComparisons.js';
import {
  SCHEDULES, PRESETS, MAX_SAVED, periodFor, isDue, presetRange, emailFor,
} from '../features/reporting/savedReports.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const appUrl = () => process.env.CLIENT_URL || process.env.FRONTEND_URL || null;

// The spec without its dates: a saved report runs over a period
// chosen when it runs, not the one it was saved with.
const cleanSpec = (kind, spec) => {
  if (!spec || typeof spec !== 'object') throw fail(400, 'Nothing to save.');
  if (kind === 'comparison') {
    if (!getComparison(spec.comparison)) throw fail(400, 'Unknown comparison.');
    return { comparison: spec.comparison };
  }
  if (kind === 'custom') {
    const v = validateCustom({ custom: spec.custom });
    return { custom: v.custom };
  }
  if (kind === 'report') {
    const v = validateSpec({ metric: spec.metric, dimension: spec.dimension, filters: spec.filters ?? {}, dateRange: { from: '2026-01-01', to: '2026-01-31' } });
    return { metric: v.metric, dimension: v.dimension, filters: v.filters ?? {} };
  }
  throw fail(400, 'kind must be report, custom or comparison.');
};

const cleanTitle = (t) => {
  const s = typeof t === 'string' ? t.trim().replace(/\s+/g, ' ') : '';
  if (!s) throw fail(400, 'Give the report a name.');
  return s.slice(0, 120);
};

const checkSchedule = (s) => {
  if (s === undefined || s === null) return undefined;
  if (!SCHEDULES.includes(s)) throw fail(400, `Schedule must be one of: ${SCHEDULES.join(', ')}.`);
  return s;
};
const checkPreset = (p) => {
  if (p === undefined || p === null) return undefined;
  if (!PRESETS.includes(p)) throw fail(400, `Period must be one of: ${PRESETS.join(', ')}.`);
  return p;
};

const toId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw fail(400, 'Unknown saved report.');
  return n;
};

export const list = (userId) => repo.listForUser(userId);

export const create = async (userId, body = {}) => {
  const kind = body.kind;
  const spec = cleanSpec(kind, body.spec);
  const title = cleanTitle(body.title);
  if ((await repo.countForUser(userId)) >= MAX_SAVED) {
    throw fail(400, `You can keep up to ${MAX_SAVED} saved reports. Remove one first.`);
  }
  return repo.create({
    userId, title, kind, spec,
    preset: checkPreset(body.preset) ?? 'last_3m',
    pinned: Boolean(body.pinned),
    schedule: checkSchedule(body.schedule) ?? 'none',
  });
};

export const update = async (userId, id, body = {}) => {
  const row = await repo.update({
    userId, id: toId(id),
    title: body.title === undefined ? undefined : cleanTitle(body.title),
    pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
    schedule: checkSchedule(body.schedule),
    preset: checkPreset(body.preset),
  });
  if (!row) throw fail(404, 'Unknown saved report.');
  return row;
};

export const remove = async (userId, id) => {
  if (!(await repo.remove({ userId, id: toId(id) }))) throw fail(404, 'Unknown saved report.');
  return { removed: true };
};

/** Run a saved report over `dateRange`. */
export const runSaved = (saved, dateRange) => {
  if (saved.kind === 'comparison') return insightService.runComparison({ id: saved.spec.comparison, dateRange });
  if (saved.kind === 'custom') return reportingService.runReport({ custom: saved.spec.custom, dateRange });
  return reportingService.runReport({ ...saved.spec, dateRange });
};

const send = async (saved, period) => {
  if (!saved.email) throw fail(400, 'Your account has no email address, so the report cannot be sent.');
  const result = await runSaved(saved, { from: period.from, to: period.to });
  const mail = emailFor({ saved, result, period, appUrl: appUrl() });
  const res = await emailProvider.sendEmail({ to: saved.email, ...mail });
  if (res?.sent === false) throw fail(502, `The email could not be sent: ${res.error ?? res.reason ?? 'unknown error'}.`);
  return res;
};

/** "Send me this now": the page's period, to the owner. */
export const sendNow = async (userId, id) => {
  const saved = await repo.getForUser({ userId, id: toId(id) });
  if (!saved) throw fail(404, 'Unknown saved report.');
  const today = reportingService.todayISO();
  const period = saved.schedule !== 'none'
    ? periodFor(saved.schedule, today)
    : { ...presetRange(saved.preset, today), label: 'on request' };
  const res = await send(saved, period);
  return { sent: true, to: saved.email, stubbed: Boolean(res?.stubbed) };
};

/** The scheduled sweep: every due report, once. Failures are recorded, not thrown. */
export const sendDue = async () => {
  const today = reportingService.todayISO();
  const rows = await repo.listScheduled();
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (!isDue(row, today)) continue;
    try {
      await send(row, periodFor(row.schedule, today));
      await repo.markSent({ id: row.id });
      sent += 1;
    } catch (err) {
      failed += 1;
      await repo.markSent({ id: row.id, error: err.message }).catch(() => {});
      console.error(`[savedReports] report ${row.id} failed:`, err.message);
    }
  }
  return { checked: rows.length, sent, failed };
};

export default { list, create, update, remove, runSaved, sendNow, sendDue };
