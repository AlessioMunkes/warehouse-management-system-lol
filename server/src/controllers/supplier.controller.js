// ─────────────────────────────────────────────────────────────
// server/src/controllers/supplier.controller.js
//
// Thin HTTP layer. Pulls values off the request, calls the service,
// shapes the response. No validation and no SQL live here.
//
// Reads err.status rather than string-matching err.message, the same
// convention as picking.controller.js and stock.controller.js. Unlike
// stock, the service this calls actually attaches .status to every
// error it throws, so 400/404/409 arrive as themselves rather than
// collapsing into 500.
//
// Messages are only echoed to the client for status < 500. A 500 is
// by definition something the caller cannot act on, and its message
// may carry database internals.
// ─────────────────────────────────────────────────────────────
import supplierService from '../services/supplier.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/suppliers?includeInactive=&search= ───────────────
const list = async (req, res) => {
  try {
    const data = await supplierService.listSuppliers({
      includeInactive: req.query.includeInactive,
      search: req.query.search,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listSuppliers', 'Failed to retrieve suppliers.');
  }
};

// ── GET /api/suppliers/:id ────────────────────────────────────
// Returns the supplier plus trading stats and recent purchase orders.
const getOne = async (req, res) => {
  try {
    const data = await supplierService.getSupplier(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getSupplier', 'Failed to retrieve supplier.');
  }
};

// ── POST /api/suppliers ───────────────────────────────────────
const register = async (req, res) => {
  try {
    const data = await supplierService.registerSupplier(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'registerSupplier', 'Failed to register supplier.');
  }
};

// ── PATCH /api/suppliers/:id ──────────────────────────────────
const update = async (req, res) => {
  try {
    const data = await supplierService.updateSupplier(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'updateSupplier', 'Failed to update supplier.');
  }
};

// ── PATCH /api/suppliers/:id/status ───────────────────────────
// Activate or deactivate. There is no DELETE: purchase_orders and
// delivery_notes both reference suppliers ON DELETE RESTRICT, so a
// delete endpoint would fail on precisely the suppliers worth keeping.
const setStatus = async (req, res) => {
  try {
    const data = await supplierService.setSupplierStatus(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'setSupplierStatus', 'Failed to change supplier status.');
  }
};

// ── GET /api/suppliers/prospects ──────────────────────────────
const listProspects = async (req, res) => {
  try {
    const data = await supplierService.listProspects({ status: req.query.status });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listProspects', 'Failed to retrieve prospects.');
  }
};

// ── POST /api/suppliers/prospects ─────────────────────────────
const addProspect = async (req, res) => {
  try {
    const data = await supplierService.addProspect(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'addProspect', 'Failed to save prospect.');
  }
};

// ── PATCH /api/suppliers/prospects/:id ────────────────────────
const updateProspect = async (req, res) => {
  try {
    const data = await supplierService.updateProspect(req.params.id, req.body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'updateProspect', 'Failed to update prospect.');
  }
};

// ── POST /api/suppliers/prospects/:id/delete ──────────────────
// POST rather than DELETE because client/src/services/api.js exposes
// apiGet, apiPost and apiPatch only. Adding an apiDelete for one
// endpoint is a bigger change than this route shape.
const removeProspect = async (req, res) => {
  try {
    const data = await supplierService.removeProspect(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'removeProspect', 'Failed to delete prospect.');
  }
};

// ── POST /api/suppliers/prospects/:id/convert ─────────────────
// Returns { supplier, prospect } — the new supplier and the stamped
// lead, so the UI can move the card without a refetch.
const convertProspect = async (req, res) => {
  try {
    const result = await supplierService.convertProspect(req.params.id, req.body, req.user.id);
    res.status(201).json({
      success: true,
      data: { supplier: result.supplier, prospect: result.prospect },
    });
  } catch (err) {
    respondError(res, err, 'convertProspect', 'Failed to convert prospect.');
  }
};

// ── DELETE /api/suppliers/:id ─────────────────────────────────
// Not a SQL DELETE — purchase_orders and delivery_notes reference
// suppliers ON DELETE RESTRICT, which is the note above setStatus. This
// removes the supplier from the directory and every picker and leaves
// the referenced row intact.
const remove = async (req, res) => {
  try {
    const data = await supplierService.archiveSupplier(req.params.id, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'archiveSupplier', 'Failed to delete supplier.');
  }
};

export default {
  list,
  getOne,
  register,
  update,
  setStatus,
  remove,
  listProspects,
  addProspect,
  updateProspect,
  removeProspect,
  convertProspect,
};
