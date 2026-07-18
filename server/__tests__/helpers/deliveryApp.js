// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/deliveryApp.js
//
// Minimal Express app wiring up just the delivery routes,
// mirroring index.js without app.listen(). Callers are expected
// to vi.mock('../src/services/delivery.service.js') before
// importing this helper, since delivery.routes.js pulls in the
// controller/service/repository chain.
// ─────────────────────────────────────────────────────────────
import express        from 'express';
import cookieParser   from 'cookie-parser';
import deliveryRouter from '../../src/routes/delivery.routes.js';

export const buildDeliveryApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/deliveries', deliveryRouter);
  return app;
};
