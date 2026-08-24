// ─────────────────────────────────────────────────────────────
// server/src/controllers/purchaseOrder.controller.js
//
// Thin HTTP layer, matching supplier.controller.js. No validation and
// no SQL here.
// ─────────────────────────────────────────────────────────────
import purchaseOrderService from '../services/purchaseOrder.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  const body = {
    success: false,
    message: status < 500 ? err.message : fallback,
  };
  // Carried through so the form can highlight the offending rows
  // rather than making the manager re-read a 30-line order herself.
  if (err.missingProductIds) body.missingProductIds = err.missingProductIds;
  res.status(status).json(body);
};

// ── POST /api/purchase-orders ─────────────────────────────────
const create = async (req, res) => {
  try {
    const data = await purchaseOrderService.createPurchaseOrder(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'createPurchaseOrder', 'Failed to create the purchase order.');
  }
};

// ── GET /api/purchase-orders?status=&supplierId= ──────────────
const list = async (req, res) => {
  try {
    const data = await purchaseOrderService.listPurchaseOrders({
      status:     req.query.status,
      supplierId: req.query.supplierId,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listPurchaseOrders', 'Failed to retrieve purchase orders.');
  }
};

// ── GET /api/purchase-orders/:id ──────────────────────────────
const getOne = async (req, res) => {
  try {
    const data = await purchaseOrderService.getPurchaseOrder(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getPurchaseOrder', 'Failed to retrieve the purchase order.');
  }
};

export default { create, list, getOne };
