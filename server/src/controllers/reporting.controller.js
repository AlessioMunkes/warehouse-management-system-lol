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

export default { getCatalog, runReport, ask };
