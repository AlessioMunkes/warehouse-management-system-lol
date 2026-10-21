// ─────────────────────────────────────────────────────────────
// server/src/routes/productBarcode.routes.js
//
// Product barcodes (migration 052), mounted beside product.routes.js
// on /api/products. Its own file so the product route tests, which mock
// product.service.js alone, do not have to know about it.
//
// ROLES
//   lookup, list   ALL_STAFF. The floor scans; reading a code is no more
//                  exposure than reading the catalogue it points into.
//   link           ALL_STAFF. An unknown barcode turns up at the bay, in
//                  the hands of the person who knows what is in the box.
//                  The link is audited with who made it and changes
//                  nothing on the product row (productBarcode.service.js).
//   unlink         ADMIN_ONLY, the role that owns master data. A wrong
//                  link is put right from the product's own panel.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, ADMIN_ONLY } from '../constants/permissions.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import barcodeController from '../controllers/productBarcode.controller.js';

const router = express.Router();

// Two path segments, so it never meets product.routes.js's GET /:id.
router.get('/barcodes/:code',
  auth, requireRole(...ALL_STAFF), barcodeController.lookup);

router.get('/:id/barcodes',
  auth, requireRole(...ALL_STAFF), validateIntId, barcodeController.list);

router.post('/:id/barcodes',
  auth, requireRole(...ALL_STAFF), validateIntId, barcodeController.link);

router.delete('/:id/barcodes/:barcodeId',
  auth, requireRole(...ADMIN_ONLY), validateIntId, validateIntParam('barcodeId'), barcodeController.unlink);

export default router;
