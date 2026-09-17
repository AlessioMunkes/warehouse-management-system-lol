// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/loveActivismApp.js
//
// Minimal Express app wiring up just the love-activism routes,
// mirroring index.js without app.listen(). Callers are expected to
// vi.mock() the five love-activism services before importing this
// helper, since loveActivism.routes.js pulls in the controller /
// service / repository chain and config/db.js calls process.exit(1)
// when DATABASE_URL is absent.
//
// Includes the same central error handler as server/index.js so
// next(err) from controllers surfaces as { success:false, message }
// with err.status (generic message for 5xx).
// ─────────────────────────────────────────────────────────────
import express from 'express';
import cookieParser from 'cookie-parser';
import loveActivismRouter from '../../src/routes/loveActivism.routes.js';

export const buildLoveActivismApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/love-activism', loveActivismRouter);
  // Central error handler — mirrors server/index.js
  // TEST-ONLY addition: log the underlying error (message/stack/pg
  // code+detail) so a 500 during Scenario A shows the REAL cause
  // instead of only the generic HTTP body. Response shape unchanged.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      console.error(
        `[loveActivismApp][${req.method} ${req.path}] underlying error:`,
        err.message,
        '| code:',
        err.code ?? null,
        '| detail:',
        err.detail ?? null,
        '| constraint:',
        err.constraint ?? null,
        '| table:',
        err.table ?? null,
      );
      if (err.stack) console.error(err.stack);
    }
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'An unexpected error occurred. Please try again.',
    });
  });
  return app;
};
