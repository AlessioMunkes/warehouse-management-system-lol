// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/productApp.js
//
// Minimal Express app wiring up just the product routes, mirroring
// index.js without app.listen() — same pattern as userApp.js/
// supplierApp.js. Callers must vi.mock('../src/services/product.service.js')
// before importing this helper: product.routes.js pulls in the
// controller/service/repository chain, and product.repository.js
// imports config/db.js, which calls process.exit(1) when
// DATABASE_URL is absent.
// ─────────────────────────────────────────────────────────────
import express       from 'express';
import cookieParser  from 'cookie-parser';
import productRouter from '../../src/routes/product.routes.js';

export const buildProductApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/products', productRouter);
  return app;
};
