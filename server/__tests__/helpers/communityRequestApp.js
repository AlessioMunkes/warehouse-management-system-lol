// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/communityRequestApp.js
//
// Minimal Express app wiring up just the benevolent request routes,
// without app.listen(). Callers must
// vi.mock('../src/services/communityRequest.service.js') before
// importing this helper.
// ─────────────────────────────────────────────────────────────
import express                from 'express';
import cookieParser           from 'cookie-parser';
import communityRequestRouter from '../../src/routes/communityRequest.routes.js';

export const buildCommunityRequestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/community-requests', communityRequestRouter);
  // The real app reports service errors through its error handler.
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });
  return app;
};
