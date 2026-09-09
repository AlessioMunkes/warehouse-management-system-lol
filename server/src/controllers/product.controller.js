// ─────────────────────────────────────────────────────────────
// server/src/controllers/product.controller.js
//
// Thin HTTP layer. Pulls values off the request, calls the service,
// shapes the response. No validation and no SQL live here — same
// division of labour as supplier.controller.js/user.controller.js.
// ─────────────────────────────────────────────────────────────
import productService from '../services/product.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/products?includeInactive=&search= ─────────────────
const list = async (req, res) => {
  try {
    const data = await productService.listProducts({
      includeInactive: req.query.includeInactive,
      search: req.query.search,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listProducts', 'Failed to retrieve products.');
  }
};

// ── GET /api/products/:id ───────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const data = await productService.getProductById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getProduct', 'Failed to retrieve product.');
  }
};

// ── POST /api/products ──────────────────────────────────────────
const register = async (req, res) => {
  try {
    const data = await productService.createProduct(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'createProduct', 'Failed to create product.');
  }
};

// ── PATCH /api/products/:id ─────────────────────────────────────
const update = async (req, res) => {
  try {
    const data = await productService.updateProduct(req.params.id, req.body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'updateProduct', 'Failed to update product.');
  }
};

// ── PATCH /api/products/:id/status ──────────────────────────────
const setStatus = async (req, res) => {
  try {
    const data = await productService.setActive(req.params.id, req.body?.isActive);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'setProductStatus', 'Failed to change product status.');
  }
};

export default {
  list,
  getOne,
  register,
  update,
  setStatus,
};
