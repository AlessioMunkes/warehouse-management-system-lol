// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/notificationApp.js
//
// Minimal Express app wiring up just the notification routes,
// mirroring index.js without app.listen(). Callers must
// vi.mock('../src/services/notification.service.js') before
// importing this helper.
// ─────────────────────────────────────────────────────────────
import express            from 'express';
import cookieParser       from 'cookie-parser';
import notificationRouter from '../../src/routes/notification.routes.js';

export const buildNotificationApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/notifications', notificationRouter);
  return app;
};
