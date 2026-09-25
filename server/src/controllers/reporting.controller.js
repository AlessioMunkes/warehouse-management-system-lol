// ─────────────────────────────────────────────────────────────
// server/src/controllers/reporting.controller.js
//
// Thin HTTP layer. All logic lives in the services, which attach
// .status to everything they throw — same convention as
// dispatch.controller.js and picking.controller.js.
//
// WHY SOME 5xx MESSAGES ARE PASSED THROUGH
// The usual rule is that 5xx text is hidden, because a stack trace
// or a database error leaking to a user is both useless and a
// disclosure risk. But provider.js raises 502/503/504 for upstream
// conditions the manager CAN act on — the assistant timed out, the
// key is not configured, the provider is unreachable — and those
// messages are written for them. Masking them behind "could not
// answer that" turned an actionable condition into a dead end.
//
// The allowlist is explicit rather than a status range, so a genuine
// 500 from our own code still says nothing.
// ─────────────────────────────────────────────────────────────
import reportingService from '../services/reporting.service.js';
import aiService        from '../services/reportingAi.service.js';
import insightService   from '../services/reportingInsight.service.js';

// Upstream conditions whose text is safe and useful to show.
const PASS_THROUGH = new Set([502, 503, 504]);

const send = (res, err, fallback) => {
  const status = err.status || 500;
  const showMessage = status < 500 || PASS_THROUGH.has(status);
  res.status(status).json({
    success: false,
    message: showMessage ? err.message : fallback,
  });
};

// GET /api/reporting/catalog
const getCatalog = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: reportingService.getCatalog() });
  } catch (err) {
    console.error('[getCatalog]', err.message);
    send(res, err, 'Failed to load the report catalog.');
  }
};

// POST /api/reporting/report
const runReport = async (req, res) => {
  try {
    const report = await reportingService.runReport(req.body);
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    console.error('[runReport]', err.message);
    send(res, err, 'Failed to run the report.');
  }
};

// POST /api/reporting/ask
// Returns a report payload, or { type:'clarify', question, options }.
const ask = async (req, res) => {
  try {
    const result = await aiService.ask({
      question: req.body?.question,
      userId: req.user?.id,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    // Full stack on a genuine 500 — a bug in our own code needs the
    // trace, not just the message.
    if (!err.status || err.status >= 500) console.error('[ask]', err);
    else console.error('[ask]', err.status, err.message);
    send(res, err, 'The AI assistant could not answer that.');
  }
};

// POST /api/reporting/insight
// { spec, narrate } → the report plus key figures, related charts,
// who-to-act-on lists and, when narrate is true, a written reading.
// Operational metrics only; the service refuses impact ones.
const insight = async (req, res) => {
  try {
    const result = await insightService.buildInsight({
      spec: req.body?.spec,
      narrate: req.body?.narrate === true,
      userId: req.user?.id,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (!err.status || err.status >= 500) console.error('[insight]', err);
    else console.error('[insight]', err.status, err.message);
    send(res, err, 'Failed to build the report breakdown.');
  }
};

// GET /api/reporting/comparisons
const getComparisons = (req, res) => {
  res.status(200).json({ success: true, data: insightService.listComparisons() });
};

// POST /api/reporting/comparison  { id, dateRange }
const runComparison = async (req, res) => {
  try {
    const result = await insightService.runComparison({ id: req.body?.id, dateRange: req.body?.dateRange });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[runComparison]', err.status ?? '', err.message);
    send(res, err, 'Failed to run the comparison.');
  }
};

// GET /api/reporting/targets — this manager's effective targets.
const getTargets = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await insightService.getTargets(req.user?.id) });
  } catch (err) {
    console.error('[getTargets]', err.message);
    send(res, err, 'Failed to load targets.');
  }
};

// PUT /api/reporting/targets/:metricId  { value } — null resets.
const setTarget = async (req, res) => {
  try {
    const target = await insightService.setTarget({
      userId: req.user?.id, metricId: req.params.metricId, value: req.body?.value,
    });
    res.status(200).json({ success: true, data: target });
  } catch (err) {
    console.error('[setTarget]', err.status ?? '', err.message);
    send(res, err, 'Failed to save the target.');
  }
};

// PUT /api/reporting/factors/:factorKey
// Manager/admin only — see reportingFactor.repository.js for why this
// inserts a new row rather than updating one in place.
const setFactor = async (req, res) => {
  try {
    const factor = await reportingService.setFactor({
      factorKey: req.params.factorKey,
      value: req.body?.value,
      unit: req.body?.unit,
      sourceNote: req.body?.sourceNote,
      actorId: req.user?.id,
    });
    res.status(200).json({ success: true, data: factor });
  } catch (err) {
    console.error('[setFactor]', err.message);
    send(res, err, 'Failed to set the factor.');
  }
};

// GET /api/reporting/factors/:factorKey/history
const getFactorHistory = async (req, res) => {
  try {
    const history = await reportingService.getFactorHistory(req.params.factorKey);
    res.status(200).json({ success: true, data: history });
  } catch (err) {
    console.error('[getFactorHistory]', err.message);
    send(res, err, 'Failed to load factor history.');
  }
};

export default {
  getCatalog, runReport, ask, insight, getComparisons, runComparison, getTargets, setTarget,
  setFactor, getFactorHistory,
};
