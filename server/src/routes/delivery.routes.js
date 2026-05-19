// ─────────────────────────────────────────────────────────────
// server/src/routes/delivery.routes.js
//
// All delivery-related endpoints.
// Every route is protected by auth middleware — a valid JWT
// is required or the request is blocked before hitting
// the controller.
//
// Register in index.js:
//   import deliveryRouter from './src/routes/delivery.routes.js'
//   app.use('/api/deliveries', deliveryRouter)
// ─────────────────────────────────────────────────────────────
import express            from 'express';
import auth               from '../middleware/auth.middleware.js';
import deliveryController from '../controllers/delivery.controller.js';

const router = express.Router();

// ── Reference data (needed before recording a delivery) ───────
router.get('/suppliers', auth, deliveryController.getSuppliers);
router.get('/drivers',   auth, deliveryController.getDrivers);   // ?supplierId=1
router.get('/products',  auth, deliveryController.getProducts);

// ── Purchase orders (used to auto-populate the delivery form) ─
router.get('/purchase-orders',          auth, deliveryController.getPurchaseOrders);   // ?supplierId=1
router.get('/purchase-orders/:id/items', auth, deliveryController.getPurchaseOrderItems);

// ── Delivery notes ────────────────────────────────────────────
router.get('/',    auth, deliveryController.getDeliveries);      // ?range=today|week|month|all
router.get('/:id', auth, deliveryController.getDeliveryById);
router.post('/',   auth, deliveryController.createDelivery);

export default router;
