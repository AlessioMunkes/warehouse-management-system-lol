// ─────────────────────────────────────────────────────────────
// server/src/routes/product.routes.js
//
// ROLES
// Reads are open to warehouse staff, same reasoning as
// supplier.routes.js: receiving/decanting already read the product
// catalog for their own dropdowns (delivery.repository.js's own
// getProducts), so this list endpoint isn't introducing new exposure.
// Writes are admin only — creating or editing a product touches a row
// every operational table in the system references.
//
// The groups (ALL_STAFF, ADMIN_ONLY) are constants/permissions.js.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, ADMIN_ONLY } from '../constants/permissions.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import productController            from '../controllers/product.controller.js';

const router = express.Router();

// Writes below are admin only. A product row decides what every other module can count,
// pick and receive, and its reorder threshold is what the inventory
// screen's Low Stock and Shortfall figures are judged against — so
// editing one is a master-data decision, not daily operations. The
// manager's write into stock is the adjustment, which is its own
// endpoint with its own ledger row.

router.get('/',
  auth, requireRole(...ALL_STAFF), productController.list);

router.post('/',
  auth, requireRole(...ADMIN_ONLY), productController.register);

router.get('/:id',
  auth, requireRole(...ALL_STAFF), validateIntId, productController.getOne);

router.patch('/:id',
  auth, requireRole(...ADMIN_ONLY), validateIntId, productController.update);

router.patch('/:id/status',
  auth, requireRole(...ADMIN_ONLY), validateIntId, productController.setStatus);

// Deliberately tighter than the manager+admin that edits a product.
// Editing the catalogue is daily upkeep; removing something from it is
// a master-data decision and belongs to the role that owns master data.
router.delete('/:id',
  auth, requireRole(...ADMIN_ONLY), validateIntId, productController.remove);

export default router;
