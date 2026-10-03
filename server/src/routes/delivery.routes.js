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
// ── The receipts archive — manager and admin only ────────────
// Recording a delivery (POST / below) stays open to ALL_STAFF: that is the
// worker's job. Reading back every delivery ever recorded is a manager's view.
//
// /:id is closed too. Nothing in the receiving flow reads it — the worker who
// records a delivery gets the note back in the POST response — so no worker
// screen regresses.
router.get('/',
  auth, requireRole(...MANAGERS_UP),
  deliveryController.getDeliveries
);
router.get('/:id',
  auth, requireRole(...MANAGERS_UP), validateIntId,    // SEC-08
  deliveryController.getDeliveryById
);
router.post('/',
  auth, requireRole(...WORKERS_ONLY),
  deliveryController.createDelivery
);

export default router;