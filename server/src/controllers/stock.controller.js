// ─────────────────────────────────────────────────────────────
// server/src/controllers/stock.controller.js
//
// Thin HTTP layer for the inventory (stock) module. All validation and
// business logic lives in stock.service.js — controllers here only pull
// data off the request, call the service, and shape the response.
//
// Error handling: reads `err.status` off the caught error rather than
// string-matching `err.message` (see picking.controller.js for the same
// convention). Falls back to 500 when no `.status` is present.
//
// stock.service.js has a `fail(status, message)` helper mirroring
// picking.service.js's, so validation errors arrive here carrying a
// 400/404 and keep their message. (An earlier note here said it
// didn't — it does.)
// ─────────────────────────────────────────────────────────────
import stockService from '../services/stock.service.js';

// ── Get the current manifest ─────────────────────────────────────
// GET /api/stock
// Returns: every active product's current stock level, with
// is_shortfall/is_low_stock flags already computed by the repository.
const getManifest = async (req, res) => {
  try {
    const manifest = await stockService.getManifest();
    res.status(200).json({ success: true, data: manifest });
  } catch (err) {
    console.error('[getManifest]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve stock manifest.',
    });
  }
};

// ── Get movement history for one product ─────────────────────────
// GET /api/stock/:id/history
// Returns: every stock_movements row for that product, newest first.
const getMovements = async (req, res) => {
  try {
    const movements = await stockService.getMovements(req.params.id);
    res.status(200).json({ success: true, data: movements });
  } catch (err) {
    console.error('[getMovements]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve stock movement history.',
    });
  }
};

// ── Manual adjustment (manager/admin only) ────────────────────────
// POST /api/stock/adjust
// Body: { productId, quantityDelta, unit?, reason }
// Returns: { before, after, isShortfall, isUnitMismatch } — 200, not 201.
// This isn't "creating" a resource the way createSlip is; it's changing
// a value that already exists, so 200 is the correct verb-shaped code.
// isUnitMismatch is passed straight through as part of a 200 response,
// not treated as an error: the adjustment still succeeded and the
// ledger's established unit still won (see stock.repository.js), this
// is just a flag telling the caller "double check the unit you sent,"
// same way isShortfall already flags a negative balance without
// blocking the write.
const adjustManually = async (req, res) => {
  try {
    // req.user.id only, not the whole req.user object — unlike picking,
    // this service never branches on role (role gating already happened
    // at the route layer below via requireRole), so all it needs is the
    // id to attribute the movement to in the audit trail.
    const result = await stockService.adjustManually(req.body, req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[adjustManually]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to adjust stock.',
    });
  }
};

// ── The ledger, warehouse-wide (manager/admin) ───────────────────
// GET /api/stock/ledger
// Query: from, to (YYYY-MM-DD, SAST), productId, movementType
//        (repeatable or comma-separated), performedBy, referenceType,
//        limit, cursor
// Returns: { movements, summary, nextCursor }
const getLedger = async (req, res) => {
  try {
    const data = await stockService.getLedger(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getLedger]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve the stock ledger.',
    });
  }
};

// ── Balance vs ledger (manager/admin) ────────────────────────────
// GET /api/stock/ledger/reconciliation
// Returns: { products, variances } — variances is the subset that
// does not balance, and should be empty.
const getReconciliation = async (req, res) => {
  try {
    const data = await stockService.getReconciliation();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getReconciliation]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to reconcile stock balances.',
    });
  }
};

// ── Actors, for the ledger's filter bar (manager/admin) ──────────
// GET /api/stock/ledger/actors
const getLedgerActors = async (req, res) => {
  try {
    const data = await stockService.getLedgerActors();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getLedgerActors]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve ledger users.',
    });
  }
};

// ── 30-day stock level trace (all roles) ─────────────────────────
// GET /api/stock/trends?days=30
// Returns: { days, series: { [productId]: number[] } }
const getStockTrends = async (req, res) => {
  try {
    const data = await stockService.getStockTrends(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getStockTrends]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve stock trends.',
    });
  }
};

export default {
  getManifest,
  getMovements,
  adjustManually,
  getStockTrends,
  getLedger,
  getReconciliation,
  getLedgerActors,
};
