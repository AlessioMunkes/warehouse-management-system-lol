// ─────────────────────────────────────────────────────────────
// server/src/controllers/picking.controller.js
//
// Thin HTTP layer for the picking workflow. All business logic and
// validation lives in picking.service.js — controllers here only
// pull data off the request, call the service, and shape the response.
//
// Error handling: picking.service.js attaches a `.status` to every error
// it throws (see the `fail()` helper at the top of that file), so every
// catch block below reads `err.status` directly instead of pattern-matching
// on `err.message` (that string-matching approach is what decanting.controller.js
// does and it's brittle — a copy-edit to a message silently breaks the
// status code). Unrecognised errors (no `.status`, e.g. a DB blew up) fall
// back to 500 with a generic message so we never leak internals to the client.
// ─────────────────────────────────────────────────────────────
import pickingService from '../services/picking.service.js';

// ── List slips ──────────────────────────────────────────────────
// GET /api/picking?dispatchDate=&cohort=&status=&mine=
// Returns: the picking board — one row per slip, with progress counts
// baked in by the repository query. Packers requesting `mine=true` only
// get their own slips; managers always see everything (enforced in the
// service, not here).
const getSlips = async (req, res) => {
  try {
    // Whole req.user is passed through (not just req.user.id) because the
    // service needs the role too, to decide whether "mine=true" should
    // actually filter (packers) or be ignored (managers see everything).
    const slips = await pickingService.getSlips(req.query, req.user);
    res.status(200).json({ success: true, data: slips });
  } catch (err) {
    console.error('[getSlips]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve picking slips.',
    });
  }
};

// ── One slip ─────────────────────────────────────────────────────
// GET /api/picking/:id
// Returns: a single slip with its full list of line items attached.
const getSlipById = async (req, res) => {
  try {
    const slip = await pickingService.getSlipById(req.params.id);
    res.status(200).json({ success: true, data: slip });
  } catch (err) {
    console.error('[getSlipById]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve picking slip.',
    });
  }
};

// ── Generate the week's slips (manager only) ──────────────────────
// POST /api/picking/generate
// Body: { dispatchDate, cohort }
// Returns: { created } — how many new slips were inserted. Idempotent on
// the repository side, so calling this twice for the same day is safe.
const generateSlips = async (req, res) => {
  try {
    const result = await pickingService.generateSlips(req.body, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[generateSlips]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to generate picking slips.',
    });
  }
};

// ── Create a single ad-hoc slip (manager only) ─────────────────────
// POST /api/picking
// Body: { ecdId, dispatchDate, cohort, force }
// Returns: { slipId, itemCount } for the newly created slip.
const createSlip = async (req, res) => {
  try {
    const result = await pickingService.createSlip(req.body, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[createSlip]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to create picking slip.',
    });
  }
};

// ── Claim a slip ─────────────────────────────────────────────────
// POST /api/picking/:id/assign
// Body: { packerId } — only honoured for managers; a packer always
// claims for themselves regardless of what's in the body (enforced
// in the service).
// Returns: the updated slip.
const assignSlip = async (req, res) => {
  try {
    const slip = await pickingService.assignSlip(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, data: slip });
  } catch (err) {
    console.error('[assignSlip]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to assign picking slip.',
    });
  }
};

// ── Confirm a line ───────────────────────────────────────────────
// POST /api/picking/:id/items/:itemId/confirm
// Body: { packedQuantity }
// Returns: the updated line item.
const confirmItem = async (req, res) => {
  try {
    const item = await pickingService.confirmItem(req.params.id, req.params.itemId, req.body, req.user);
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    console.error('[confirmItem]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to confirm item.',
    });
  }
};

// ── Flag a line ──────────────────────────────────────────────────
// POST /api/picking/:id/items/:itemId/flag
// Body: { flagReason, packedQuantity? }
// Returns: the updated line item.
const flagItem = async (req, res) => {
  try {
    const item = await pickingService.flagItem(req.params.id, req.params.itemId, req.body, req.user);
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    console.error('[flagItem]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to flag item.',
    });
  }
};

// ── Complete a slip ──────────────────────────────────────────────
// POST /api/picking/:id/complete
// Body: { palletRef }
// Returns: { slip, shortfalls? } — shortfalls is only present when a
// confirmed quantity exceeded recorded stock, so a manager can reconcile.
const completeSlip = async (req, res) => {
  try {
    const result = await pickingService.completeSlip(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[completeSlip]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to complete picking slip.',
    });
  }
};

export default {
  getSlips,
  getSlipById,
  generateSlips,
  createSlip,
  assignSlip,
  confirmItem,
  flagItem,
  completeSlip,
};
