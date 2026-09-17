// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/purchaseOrderApp.js
//
// Minimal Express app wiring up just the purchase order routes,
// mirroring index.js without app.listen() — same pattern as
// productApp.js/beneficiaryApp.js. Callers must
// vi.mock('../src/services/purchaseOrder.service.js') before
// importing this helper.
// ─────────────────────────────────────────────────────────────
import express             from 'express';
import cookieParser        from 'cookie-parser';
import purchaseOrderRouter from '../../src/routes/purchaseOrder.routes.js';

export const buildPurchaseOrderApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/purchase-orders', purchaseOrderRouter);
  return app;
};
