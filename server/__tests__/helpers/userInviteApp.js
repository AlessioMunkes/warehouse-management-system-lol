// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/userInviteApp.js
//
// Minimal Express app wiring up just the invite routes — same
// pattern as userApp.js. Callers must vi.mock the invite service
// before importing this helper.
// ─────────────────────────────────────────────────────────────
import express      from 'express';
import cookieParser from 'cookie-parser';
import userInviteRouter from '../../src/routes/userInvite.routes.js';

export const buildUserInviteApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/invites', userInviteRouter);
  return app;
};
