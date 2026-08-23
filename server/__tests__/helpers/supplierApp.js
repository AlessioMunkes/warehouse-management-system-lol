// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/supplierApp.js
//
// Minimal Express app wiring up just the supplier routes, mirroring
// index.js without app.listen(). Callers must
// vi.mock('../src/services/supplier.service.js') before importing
// this helper: supplier.routes.js pulls in the controller/service/
// repository chain, and supplier.repository.js imports config/db.js,
// which calls process.exit(1) when DATABASE_URL is absent.
// ─────────────────────────────────────────────────────────────
import express        from 'express';
import cookieParser   from 'cookie-parser';
import supplierRouter from '../../src/routes/supplier.routes.js';

export const buildSupplierApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/suppliers', supplierRouter);
  return app;
};
