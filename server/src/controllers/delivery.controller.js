// ─────────────────────────────────────────────────────────────
// server/src/controllers/delivery.controller.js
//
// Thin HTTP layer for goods-in. All business logic and validation
// lives in delivery.service.js — controllers here only pull data off
// the request, call the service, and shape the response.
//
// Error handling: delivery.service.js now attaches a `.status` to
// every error it throws (see the `fail()` helper at the top of that
// file), so every catch block below reads `err.status` directly, the
// same convention dispatch, donation, picking and stock already use.
//
// This replaces status-by-string-matching. The old version asked
// `err.message.includes('required') ? 400 : 500`, which meant a line
// that did not belong to the purchase order, or a duplicated line,
// came back as a 500 — a server fault — while also echoing the raw
// message in the body, which is the one thing the 5xx branch is
// supposed to prevent. Unrecognised errors (no `.status`, e.g. the
// database blew up) still fall back to 500 with a generic message so
// nothing internal leaks.
// ─────────────────────────────────────────────────────────────
import deliveryService from '../services/delivery.service.js';

// Every handler answers the same way, so the shape is written once.
const respondWithError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/deliveries?range=today|week|month|all ───────────
const getDeliveries = async (req, res) => {
  try {
    const deliveries = await deliveryService.getDeliveries(req.query.range || 'all');
    res.json({ success: true, data: deliveries });
  } catch (err) {
    respondWithError(res, err, 'getDeliveries', 'Failed to retrieve deliveries.');
  }
};

// ── GET /api/deliveries/:id ──────────────────────────────────
const getDeliveryById = async (req, res) => {
  try {
    const delivery = await deliveryService.getDeliveryById(req.params.id);
    res.json({ success: true, data: delivery });
  } catch (err) {
    respondWithError(res, err, 'getDeliveryById', 'Failed to retrieve delivery.');
  }
};

// ── POST /api/deliveries ─────────────────────────────────────
// Body: { supplierId, deliveryDate, purchaseOrderId, signatureData,
//         poCompleted?, lineItems[], idempotencyKey? }
//
// 201 for a newly recorded delivery; 200 for a replay, the same
// "a retry is not a failure" rule donation intake and the dispatch
// gate use. The response carries `duplicate` so the client can say
// "already recorded" rather than "saved" — the goods only came in
// once and the receipt should not claim otherwise.
const createDelivery = async (req, res) => {
  try {
    const result = await deliveryService.createDelivery(req.body, req.user.id);
    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      data: {
        ...result.note,
        warnings:  result.warnings,
        duplicate: result.duplicate,
      },
    });
  } catch (err) {
    respondWithError(res, err, 'createDelivery', 'Failed to record delivery.');
  }
};

// ── GET /api/deliveries/suppliers ────────────────────────────
const getSuppliers = async (req, res) => {
  try {
    const suppliers = await deliveryService.getSuppliers();
    res.json({ success: true, data: suppliers });
  } catch (err) {
    respondWithError(res, err, 'getSuppliers', 'Failed to retrieve suppliers.');
  }
};

// ── GET /api/deliveries/products ─────────────────────────────
const getProducts = async (req, res) => {
  try {
    const products = await deliveryService.getProducts();
    res.json({ success: true, data: products });
  } catch (err) {
    respondWithError(res, err, 'getProducts', 'Failed to retrieve products.');
  }
};

// ── GET /api/deliveries/purchase-orders?supplierId=1 ─────────
const getPurchaseOrders = async (req, res) => {
  try {
    const orders = await deliveryService.getPurchaseOrdersBySupplier(req.query.supplierId);
    res.json({ success: true, data: orders });
  } catch (err) {
    respondWithError(res, err, 'getPurchaseOrders', 'Failed to retrieve purchase orders.');
  }
};

// ── GET /api/deliveries/purchase-orders/:id/items ────────────
const getPurchaseOrderItems = async (req, res) => {
  try {
    const items = await deliveryService.getPurchaseOrderItems(req.params.id);
    res.json({ success: true, data: items });
  } catch (err) {
    respondWithError(res, err, 'getPurchaseOrderItems', 'Failed to retrieve purchase order items.');
  }
};

export default {
  getDeliveries,
  getDeliveryById,
  createDelivery,
  getSuppliers,
  getProducts,
  getPurchaseOrders,
  getPurchaseOrderItems,
};