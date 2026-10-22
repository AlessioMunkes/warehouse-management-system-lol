// ─────────────────────────────────────────────────────────────
// server/src/controllers/productBarcode.controller.js
//
// Thin HTTP layer over productBarcode.service.js, same division of
// labour as product.controller.js.
// ─────────────────────────────────────────────────────────────
import barcodeService from '../services/productBarcode.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/products/barcodes/:code ────────────────────────────
const lookup = async (req, res) => {
  try {
    const data = await barcodeService.lookup(req.params.code);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'lookupBarcode', 'Failed to look up the barcode.');
  }
};

// ── GET /api/products/:id/barcodes ──────────────────────────────
const list = async (req, res) => {
  try {
    const data = await barcodeService.listForProduct(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listBarcodes', 'Failed to retrieve barcodes.');
  }
};

// ── POST /api/products/:id/barcodes ─────────────────────────────
const link = async (req, res) => {
  try {
    const data = await barcodeService.link(req.params.id, req.body ?? {}, req.user?.id ?? null);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'linkBarcode', 'Failed to link the barcode.');
  }
};

// ── DELETE /api/products/:id/barcodes/:barcodeId ────────────────
const unlink = async (req, res) => {
  try {
    const data = await barcodeService.unlink(req.params.id, req.params.barcodeId, req.user?.id ?? null);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'unlinkBarcode', 'Failed to remove the barcode.');
  }
};

// ── GET /api/products/barcodes ──────────────────────────────────
const listAll = async (req, res) => {
  try {
    const data = await barcodeService.listAll();
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listAllBarcodes', 'Failed to retrieve barcodes.');
  }
};

// ── POST /api/products/barcodes/events ──────────────────────────
const recordScan = async (req, res) => {
  try {
    const data = await barcodeService.recordScan(req.body ?? {}, req.user?.id ?? null);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'recordScan', 'Failed to record the scan.');
  }
};

// ── GET /api/products/barcodes/:code/suggestion ─────────────────
const suggest = async (req, res) => {
  try {
    const data = await barcodeService.suggest(req.params.code);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'suggestProduct', 'Failed to look up the barcode.');
  }
};

export default { lookup, list, link, unlink, listAll, recordScan, suggest };
