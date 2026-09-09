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

const READERS    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGES_UP = [ROLES.MANAGER, ROLES.ADMIN];

router.get('/',
  auth, requireRole(...READERS), productController.list);

router.post('/',
  auth, requireRole(...MANAGES_UP), productController.register);

router.get('/:id',
  auth, requireRole(...READERS), validateIntId, productController.getOne);

router.patch('/:id',
  auth, requireRole(...MANAGES_UP), validateIntId, productController.update);

router.patch('/:id/status',
  auth, requireRole(...MANAGES_UP), validateIntId, productController.setStatus);

export default router;
