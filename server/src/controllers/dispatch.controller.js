// ─────────────────────────────────────────────────────────────
// server/src/controllers/dispatch.controller.js
//
// Thin HTTP layer for the dispatch gate. All business logic and
// validation lives in dispatch.service.js — controllers here only
// pull data off the request, call the service, and shape the response.
//
// Error handling: dispatch.service.js attaches a `.status` to every
// error it throws (see the `fail()` helper at the top of that file),
// so every catch block below reads `err.status` directly, the same
// convention picking.controller.js and stock.controller.js use.
// Unrecognised errors (no `.status`, e.g. a DB blew up) fall back to
// 500 with a generic message so we never leak internals to the client.
//
// Two id spaces meet in this router and must not be confused:
// :id below is always a picking_slip_id (the pallet); the dispatch
// note lives under /notes/:eventId, a dispatch_events id.
// ─────────────────────────────────────────────────────────────
import dispatchService from '../services/dispatch.service.js';

// ── The gate board ───────────────────────────────────────────
// GET /api/dispatch?dispatchDate=&cohort=&status=
// Returns: every packed pallet for the day, one row per slip, with
// today's dispatch status baked in. May opportunistically run the
// 16:00 non-collection sweep as a side effect (see the service).
const getBoard = async (req, res) => {
  try {
    const board = await dispatchService.getBoard(req.query, req.user);
    res.status(200).json({ success: true, data: board });
  } catch (err) {
    console.error('[getBoard]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve the dispatch board.',
    });
  }
};

// ── Run the 16:00 sweep on demand (manager only) ─────────────
// POST /api/dispatch/sweep
// Body: { dispatchDate? } — defaults to today.
// Returns: { flagged, slipIds } — every pallet just written off.
const sweep = async (req, res) => {
  try {
    const result = await dispatchService.sweep(req.body, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[sweep]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to run the non-collection sweep.',
    });
  }
};

// ── Non-collection history (BR-26) ───────────────────────────
// GET /api/dispatch/non-collections?ecdId=&from=&to=
// Returns: every non-collection event in range, with a running
// per-ECD count so a repeat offender stands out.
const getNonCollectionHistory = async (req, res) => {
  try {
    const history = await dispatchService.getNonCollectionHistory(req.query, req.user);
    res.status(200).json({ success: true, data: history });
  } catch (err) {
    console.error('[getNonCollectionHistory]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve non-collection history.',
    });
  }
};

// ── Dispatch note (proof of collection) ──────────────────────
// GET /api/dispatch/notes/:eventId
// Returns: the collection record with its lines — a dispatch_events
// id, not a picking slip id.
const getDispatchNote = async (req, res) => {
  try {
    const note = await dispatchService.getDispatchNote(req.params.eventId);
    res.status(200).json({ success: true, data: note });
  } catch (err) {
    console.error('[getDispatchNote]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve dispatch note.',
    });
  }
};

// ── One pallet at the gate ───────────────────────────────────
// GET /api/dispatch/:id
// Returns: the slip, its items, and the computed eligibility flags
// the gate screen renders as warnings.
const getGateView = async (req, res) => {
  try {
    const gateView = await dispatchService.getGateView(req.params.id);
    res.status(200).json({ success: true, data: gateView });
  } catch (err) {
    console.error('[getGateView]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve pallet.',
    });
  }
};

// ── Record a collection ──────────────────────────────────────
// POST /api/dispatch/:id/collect
// Body: { driverName, signature, vehicleReg?, lines?, idempotencyKey?,
//         overrideReason? }
// Returns: { event, isLate?, shortfalls?, unitMismatches? } — or
// { event, replayed: true } when idempotencyKey matches a prior
// collection. 201 for a newly recorded collection; 200 for a replay,
// same "a retry is not a failure" rule donation intake uses.
const collect = async (req, res) => {
  try {
    const result = await dispatchService.collect(req.params.id, req.body, req.user);
    res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    console.error('[collect]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to record collection.',
    });
  }
};

export default {
  getBoard,
  sweep,
  getNonCollectionHistory,
  getDispatchNote,
  getGateView,
  collect,
};
