// ─────────────────────────────────────────────────────────────
// server/src/routes/delivery.routes.js
//
// added role enforcement per route
// added validateIntId on all :id params
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP, WORKERS_ONLY } from '../constants/permissions.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import deliveryController           from '../controllers/delivery.controller.js';

const router = express.Router();

// ── Reference data ────────────────────────────────────────────
router.get('/suppliers', auth, requireRole(...ALL_STAFF),    deliveryController.getSuppliers);

// Archive filter options — suppliers that actually have notes. Static path,
// declared before /:id so it is not swallowed by the id route below.
router.get('/supplier-options',
  auth, requireRole(...MANAGERS_UP),
  deliveryController.getSupplierOptions
);
router.get('/products',  auth, requireRole(...ALL_STAFF),    deliveryController.getProducts);

// ── Purchase orders ───────────────────────────────────────────
router.get('/purchase-orders',
  auth, requireRole(...ALL_STAFF),
  deliveryController.getPurchaseOrders
);
router.get('/purchase-orders/:id/items',
  auth, requireRole(...ALL_STAFF), validateIntId,   // SEC-08
  deliveryController.getPurchaseOrderItems
);

// ── Delivery notes ────────────────────────────────────────────
// Reading delivery notes back is open to ALL_STAFF. The floor's Past
// deliveries screen (StaffDeliveriesPage) lists them and reopens a note
// by id, so a worker who closed the pop-up after receiving can get back
// to it. These were manager-and-admin only, which left that screen
// showing "Access denied" to the only role that can open it.
router.get('/',
  auth, requireRole(...ALL_STAFF),
  deliveryController.getDeliveries
);
router.get('/:id',
  auth, requireRole(...ALL_STAFF), validateIntId,    // SEC-08
  deliveryController.getDeliveryById
);
router.post('/',
  auth, requireRole(...WORKERS_ONLY),
  deliveryController.createDelivery
);

export default router;