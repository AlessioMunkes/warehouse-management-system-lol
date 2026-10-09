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
      limit:      req.query.limit,
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

// ── PATCH /api/purchase-orders/:id/status ──────────────────────
const setStatus = async (req, res) => {
  try {
    const data = await purchaseOrderService.setPurchaseOrderStatus(req.params.id, req.body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'setPurchaseOrderStatus', 'Failed to change the purchase order status.');
  }
};

// ── PATCH /api/purchase-orders/:id/quickbooks-ref ──────────────
const setQuickbooksReference = async (req, res) => {
  try {
    const data = await purchaseOrderService.setQuickbooksReference(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'setQuickbooksReference', 'Failed to update the QuickBooks reference.');
  }
};

// ── POST /api/purchase-orders/quickbooks-import/preview ────────
const previewQuickbooksImport = async (req, res) => {
  try {
    const data = await purchaseOrderService.previewQuickbooksImport(req.body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'previewQuickbooksImport', 'Could not check the file. Try again.');
  }
};

// ── POST /api/purchase-orders/quickbooks-import/apply ──────────
const applyQuickbooksImport = async (req, res) => {
  try {
    const data = await purchaseOrderService.applyQuickbooksImport(req.body, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'applyQuickbooksImport', 'Could not link the QuickBooks numbers. Nothing was changed.');
  }
};

// ── POST /api/purchase-orders/:id/finance-email/resend ─────────
const resendFinanceEmail = async (req, res) => {
  try {
    const data = await purchaseOrderService.resendFinanceEmail(req.params.id, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'resendFinanceEmail', 'Could not resend to Finance. Try again.');
  }
};

// ── PUT /api/purchase-orders/:id ────────────────────────────────
const update = async (req, res) => {
  try {
    const data = await purchaseOrderService.updatePurchaseOrder(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'updatePurchaseOrder', 'Failed to update the purchase order.');
  }
};

// ── DELETE /api/purchase-orders/:id ─────────────────────────────
const remove = async (req, res) => {
  try {
    await purchaseOrderService.deletePurchaseOrder(req.params.id, req.user.id);
    res.status(200).json({ success: true });
  } catch (err) {
    respondError(res, err, 'deletePurchaseOrder', 'Failed to delete the purchase order.');
  }
};

// POST /api/purchase-orders/:id/follow-up-order — a second order for
// what came short. Answers with the new order.
const createFollowUp = async (req, res) => {
  try {
    const data = await purchaseOrderService.createFollowUpOrder(req.params.id, req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'createFollowUpOrder', 'Failed to create the follow-up order.');
  }
};

export default { create, list, getOne, setStatus, createFollowUp, setQuickbooksReference, previewQuickbooksImport, applyQuickbooksImport, resendFinanceEmail, update, remove };
