// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/passwordResetApp.js
//
// Minimal Express app wiring up just the password-reset routes —
// same pattern as userInviteApp.js. Callers must vi.mock the service
// before importing this helper.
// ─────────────────────────────────────────────────────────────
import express      from 'express';
import cookieParser from 'cookie-parser';
import passwordResetRouter from '../../src/routes/passwordReset.routes.js';

export const buildPasswordResetApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/password-reset', passwordResetRouter);
  return app;
};
