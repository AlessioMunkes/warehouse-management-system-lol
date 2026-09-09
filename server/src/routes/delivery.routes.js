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

const ALL_ROLES    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];
// The receipts archive. Recording a delivery stays open to workers — that is
// the job. Browsing every delivery ever recorded is a manager's view.
const MANAGERS_UP  = [ROLES.MANAGER, ROLES.ADMIN];
const RECEIVERS_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

// ── Reference data ────────────────────────────────────────────
router.get('/suppliers', auth, requireRole(...ALL_ROLES),    deliveryController.getSuppliers);

// Archive filter options — suppliers that actually have notes. Static path,
// declared before /:id so it is not swallowed by the id route below.
router.get('/supplier-options',
  auth, requireRole(...MANAGERS_UP),
  deliveryController.getSupplierOptions
);
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
// ── The receipts archive — manager and admin only ────────────
// Recording a delivery (POST / below) stays open to RECEIVERS_UP: that is the
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
  auth, requireRole(...RECEIVERS_UP),
  deliveryController.createDelivery
);

export default router;