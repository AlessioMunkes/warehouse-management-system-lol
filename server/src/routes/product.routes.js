// ─────────────────────────────────────────────────────────────
// server/src/routes/product.routes.js
//
// ROLES
// Reads are open to warehouse staff, same reasoning as
// supplier.routes.js: receiving/decanting already read the product
// catalog for their own dropdowns (delivery.repository.js's own
// getProducts), so this list endpoint isn't introducing new exposure.
// Writes are manager and admin only — creating or editing a product
// touches a row every operational table in the system references.
//
// The role constants match users.role's CHECK exactly — see
// supplier.routes.js.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import productController            from '../controllers/product.controller.js';

const router = express.Router();

const READERS = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

// Admin only. A product row decides what every other module can count,
// pick and receive, and its reorder threshold is what the inventory
// screen's Low Stock and Shortfall figures are judged against — so
// editing one is a master-data decision, not daily operations. The
// manager's write into stock is the adjustment, which is its own
// endpoint with its own ledger row.
const WRITERS = [ROLES.ADMIN];

router.get('/',
  auth, requireRole(...READERS), productController.list);

router.post('/',
  auth, requireRole(...WRITERS), productController.register);

router.get('/:id',
  auth, requireRole(...READERS), validateIntId, productController.getOne);

router.patch('/:id',
  auth, requireRole(...WRITERS), validateIntId, productController.update);

router.patch('/:id/status',
  auth, requireRole(...WRITERS), validateIntId, productController.setStatus);

// Deliberately tighter than the manager+admin that edits a product.
// Editing the catalogue is daily upkeep; removing something from it is
// a master-data decision and belongs to the role that owns master data.
router.delete('/:id',
  auth, requireRole(ROLES.ADMIN), validateIntId, productController.remove);

export default router;
