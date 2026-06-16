// ─────────────────────────────────────────────────────────────
// server/src/routes/delivery.routes.js
//
// added role enforcement per route
// added validateIntId on all :id params
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import deliveryController           from '../controllers/delivery.controller.js';

const router = express.Router();

const ALL_ROLES    = [ROLES.PACKER, ROLES.RECEIVER, ROLES.MANAGER, ROLES.ADMIN];
const RECEIVERS_UP = [ROLES.RECEIVER, ROLES.MANAGER, ROLES.ADMIN];

// ── Reference data ────────────────────────────────────────────
router.get('/suppliers', auth, requireRole(...ALL_ROLES),    deliveryController.getSuppliers);
router.get('/drivers',   auth, requireRole(...ALL_ROLES),    deliveryController.getDrivers);
router.get('/products',  auth, requireRole(...ALL_ROLES),    deliveryController.getProducts);

// ── Purchase orders ───────────────────────────────────────────
router.get('/purchase-orders',
  auth, requireRole(...RECEIVERS_UP),
  deliveryController.getPurchaseOrders
);
router.get('/purchase-orders/:id/items',
  auth, requireRole(...RECEIVERS_UP), validateIntId,   // SEC-08
  deliveryController.getPurchaseOrderItems
);

// ── Delivery notes ────────────────────────────────────────────
router.get('/',
  auth, requireRole(...ALL_ROLES),
  deliveryController.getDeliveries
);
router.get('/:id',
  auth, requireRole(...ALL_ROLES), validateIntId,      // SEC-08
  deliveryController.getDeliveryById
);
router.post('/',
  auth, requireRole(...RECEIVERS_UP),
  deliveryController.createDelivery
);

export default router;