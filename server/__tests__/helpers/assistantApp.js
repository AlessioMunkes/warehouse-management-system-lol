// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/assistantApp.js
//
// Minimal Express app wiring up just the assistant routes,
// mirroring index.js without app.listen() — same pattern as
// userApp.js and supplierApp.js.
//
// Callers must vi.mock('../src/services/assistant.service.js')
// before importing this helper: assistant.routes.js pulls in the
// controller/service/repository chain, and assistantLog.repository.js
// imports config/db.js, which calls process.exit(1) when
// DATABASE_URL is absent.
// ─────────────────────────────────────────────────────────────
import express        from 'express';
import cookieParser   from 'cookie-parser';
import assistantRouter from '../../src/routes/assistant.routes.js';

export const buildAssistantApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/assistant', assistantRouter);
  return app;
};
