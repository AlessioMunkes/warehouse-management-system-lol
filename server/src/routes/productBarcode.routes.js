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
//   list all       ALL_STAFF. The same links lookup answers one at a
//                  time, all at once, so a phone can scan offline.
//   scan events    ALL_STAFF. A record of what a scan was, for the
//                  "caught by scanning" report; changes no stock.
//   suggestion     ADMIN_ONLY, from the Add product form: what Open Food
//                  Facts says the code is (integrations/openFoodFacts.js).
//   matches        ALL_STAFF, from the floor's New barcode panel: which
//                  stock item an unlinked code most likely belongs to
//                  (features/barcodeMatch). It suggests; the person links.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, ADMIN_ONLY } from '../constants/permissions.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import barcodeController from '../controllers/productBarcode.controller.js';

const router = express.Router();

// Every route here has a fixed /barcodes segment or a /barcodes tail,
// so none meets product.routes.js's GET /:id. This router is mounted
// first, which is what lets GET /barcodes be answered here.
router.get('/barcodes',
  auth, requireRole(...ALL_STAFF), barcodeController.listAll);

router.post('/barcodes/events',
  auth, requireRole(...ALL_STAFF), barcodeController.recordScan);

router.get('/barcodes/:code/matches',
  auth, requireRole(...ALL_STAFF), barcodeController.matches);

router.get('/barcodes/:code/suggestion',
  auth, requireRole(...ADMIN_ONLY), barcodeController.suggest);

router.get('/barcodes/:code',
  auth, requireRole(...ALL_STAFF), barcodeController.lookup);

router.get('/:id/barcodes',
  auth, requireRole(...ALL_STAFF), validateIntId, barcodeController.list);

router.post('/:id/barcodes',
  auth, requireRole(...ALL_STAFF), validateIntId, barcodeController.link);

router.delete('/:id/barcodes/:barcodeId',
  auth, requireRole(...ADMIN_ONLY), validateIntId, validateIntParam('barcodeId'), barcodeController.unlink);

export default router;
