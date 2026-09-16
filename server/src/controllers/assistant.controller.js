// ─────────────────────────────────────────────────────────────
// server/src/controllers/assistant.controller.js
//
// Thin HTTP layer for the in-app help assistant. All logic is in
// assistant.service.js, which attaches .status to everything it
// throws — same convention as reporting.controller.js.
//
// The 5xx pass-through list is the same and for the same reason:
// provider.js raises 502/503/504 for upstream conditions with
// messages written for the reader ("busy right now, try again"),
// and masking those behind a generic failure turns something they
// can act on into a dead end.
//
// The fallback text matters more here than elsewhere. Whoever reads
// it is stuck, possibly holding a crate, and "Internal server error"
// tells them nothing about what to do next. So it names the next
// step: ask a person.
// ─────────────────────────────────────────────────────────────
import assistantService from '../services/assistant.service.js';

const PASS_THROUGH = new Set([502, 503, 504]);

const send = (res, err, fallback) => {
  const status = err.status || 500;
  const showMessage = status < 500 || PASS_THROUGH.has(status);
  res.status(status).json({
    success: false,
    message: showMessage ? err.message : fallback,
  });
};

// GET /api/assistant/catalog
// The topics and per-screen suggestions for the signed-in role.
// No model call — this is a read of the catalog, fetched once when
// the panel first opens.
const getCatalog = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: assistantService.getCatalog(req.user?.role),
    });
  } catch (err) {
    console.error('[assistant.getCatalog]', err.message);
    send(res, err, 'Could not load the help topics.');
  }
};

// GET /api/assistant/topic/:id
// One topic, by id. This is what a suggestion chip and a "related"
// link call — no question, no model, no cost.
const getTopic = async (req, res) => {
  try {
    const result = assistantService.getTopicForRole(req.params.id, req.user?.role);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    send(res, err, 'Could not load that help topic.');
  }
};

// POST /api/assistant/ask
// Returns one of:
//   { type:'topic',       topic }
//   { type:'navigate',    screen }
//   { type:'clarify',     question, options }
//   { type:'not_covered', closest }
const ask = async (req, res) => {
  try {
    const result = await assistantService.ask({
      question: req.body?.question,
      screen:   req.body?.screen,
      userId:   req.user?.id,
      role:     req.user?.role,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    // Full stack on a genuine 500 — a bug in our own code needs the
    // trace, not just the message.
    if (!err.status || err.status >= 500) console.error('[assistant.ask]', err);
    else console.error('[assistant.ask]', err.status, err.message);
    send(res, err, 'I could not answer that just now. Ask your manager, or try again in a moment.');
  }
};

export default { getCatalog, getTopic, ask };
