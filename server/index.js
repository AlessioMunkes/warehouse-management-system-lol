// ─────────────────────────────────────────────────────────────
// server/index.js
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import express          from 'express';
import cors             from 'cors';
import path             from 'path';
import { fileURLToPath } from 'url';
import helmet           from 'helmet';

import donationAdminRoutes from './src/routes/donationAdmin.routes.js';
import donationIntakeRouter from './src/routes/donationIntake.routes.js';
import cookieParser     from 'cookie-parser';
import loginRateLimiter  from './src/middleware/rateLimiter.middleware.js';
import loginRouter       from './src/routes/login.route.js';
import sessionRouter     from './src/routes/session.route.js';
import deliveryRouter    from './src/routes/delivery.routes.js';
import volunteerRouter   from './src/routes/volunteer.routes.js';
import decantingRouter   from './src/routes/decanting.routes.js';
import stockRouter       from './src/routes/stock.routes.js';
import pickingRouter     from './src/routes/picking.routes.js';
import slipRouter        from './src/routes/slip.routes.js';
import donationRouter    from './src/routes/donation.routes.js';
import pendingDonationRouter from './src/routes/pendingDonation.routes.js';
import dispatchRouter    from './src/routes/dispatch.routes.js';
import supplierRouter    from './src/routes/supplier.routes.js';
import purchaseOrderRouter from './src/routes/purchaseOrder.routes.js';
import reportingRouter   from './src/routes/reporting.routes.js';
import assistantRouter   from './src/routes/assistant.routes.js';
import userRouter        from './src/routes/user.routes.js';
import userInviteRouter  from './src/routes/userInvite.routes.js';
import productRouter     from './src/routes/product.routes.js';
import dashboardRouter   from './src/routes/dashboard.routes.js';
import beneficiaryRouter from './src/routes/beneficiary.routes.js';
import notificationRouter from './src/routes/notification.routes.js';
import loveActivismRouter   from './src/routes/loveActivism.routes.js';
import communityRequestRouter from './src/routes/communityRequest.routes.js';
import gmailRouter from './src/routes/gmail.routes.js';
import certificateSettingsRouter from './src/routes/certificateSettings.routes.js';
import collectionKitRouter from './src/routes/collectionKit.routes.js';
import publicImpactRouter from './src/routes/publicImpact.routes.js';
import expiryWarningJob  from './src/jobs/expiryWarning.job.js';

console.log('[server] gmailRouter loaded:', typeof gmailRouter, gmailRouter ? 'OK' : 'UNDEFINED');

// ── Validate required secrets exist at startup ───────────────
if (!process.env.JWT_SECRET) {
  console.error('[server] FATAL: JWT_SECRET is not set. Add it to .env.local and restart.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();

// Render (and any host like it) sits behind one reverse proxy. Without
// this, req.ip is the proxy's address for every request, so the login
// rate limiter counted the whole warehouse as a single client.
app.set('trust proxy', 1);
const port = process.env.PORT || 5000;
// Origins allowed to call the API with the auth cookie.
//   - dev:                 the Vite server on 5173/5174
//   - CLIENT_ORIGIN:       an explicit override (e.g. a custom domain)
//   - RENDER_EXTERNAL_URL: set by Render itself to this service's own
//                          https URL. The client is served from that
//                          same origin, and Chrome still sends an Origin
//                          header on same-origin POSTs and font requests.
//                          Before this was listed, every login and every
//                          webfont on Render was rejected here and came
//                          back as a 500.
const allowedClientOrigins = new Set([
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://localhost:5174']),
  process.env.CLIENT_ORIGIN,
  process.env.RENDER_EXTERNAL_URL,
].filter(Boolean));

const isAllowedClientOrigin = (origin) =>
  !origin || allowedClientOrigins.has(origin);

// helmet sets 11 HTTP headers that protect against common attacks.
// Must be first — before cors, routes, everything.
app.use(helmet({
  // Content-Security-Policy: restricts what the browser is allowed to load.
  // Locks down to same-origin only — no inline scripts, no external sources.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      // Google Fonts + Tabler icon webfont are loaded via @import in
      // index.css, so their stylesheet AND font origins must be allowed
      // or the browser blocks them and every icon renders as a box.
      styleSrc:   ["'self'", "'unsafe-inline'",
                   'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      fontSrc:    ["'self'", 'data:',
                   'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
      imgSrc:     ["'self'", "data:"],           // data: needed for base64 signature images
      connectSrc: ["'self'", ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : [])],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    },
  },
  // crossOriginResourcePolicy: prevents other sites embedding your API responses
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

// ── Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(cors({
  origin:      (origin, callback) => {
    if (isAllowedClientOrigin(origin)) return callback(null, true);
    console.warn(`[CORS] blocked origin: ${origin}`);
    const err = new Error(`CORS blocked for origin: ${origin}`);
    err.status = 403;
    return callback(err);
  },
  credentials: true,
}));

// ── Serve the built client (production only) ──────────────────
// Hosting the SPA and the API on ONE origin avoids cross-site cookie
// problems entirely: sameSite:'strict' keeps working, and no CORS
// preflight is involved. In dev the Vite server on :5173 handles this.
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
}

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/login',      loginRateLimiter, loginRouter);
// Deliberately NOT behind loginRateLimiter: the client calls this on
// every app boot and every reconnect, and 10 requests per 15 minutes
// would lock a warehouse tablet out of its own session.
app.use('/api/me',         sessionRouter);
app.use('/api/deliveries', deliveryRouter);
app.use('/api/volunteers', loginRateLimiter, volunteerRouter);
app.use('/api/decanting',  decantingRouter);
app.use('/api/stock',      stockRouter);
app.use('/api/picking',    pickingRouter);
// BR-22 guest slip access. Rate limiting is applied per-route inside
// this router rather than here: the public lookups need it, the
// authenticated guest routes do not, and the limiter it uses counts
// only failures so a warehouse behind one NAT address is not locked out.
app.use('/api/slip',       slipRouter);
app.use('/api/dispatch',   dispatchRouter);
app.use('/api/donations',  pendingDonationRouter);
app.use('/api/donations',  donationRouter);
app.use('/api/donations',  donationIntakeRouter);
app.use('/api/donations/admin', donationAdminRoutes);
app.use('/api/suppliers',  supplierRouter);
app.use('/api/purchase-orders', purchaseOrderRouter);
app.use('/api/reporting',  reportingRouter);
app.use('/api/assistant',  assistantRouter);
app.use('/api/users',      userRouter);
app.use('/api/invites',    userInviteRouter);
app.use('/api/products',   productRouter);
app.use('/api/dashboard',  dashboardRouter);
app.use('/api/beneficiaries', beneficiaryRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/love-activism', loveActivismRouter);
app.use('/api/community-requests', communityRequestRouter);
app.use('/api/gmail', gmailRouter);
app.use('/api/certificate-settings', certificateSettingsRouter);
app.use('/api/collection-kits', collectionKitRouter);
app.use('/api/public',      publicImpactRouter);

// ── SPA fallback (production only) ────────────────────────────
// Any non-/api path falls through to index.html so React Router can
// handle it. Must come AFTER the API routes, or it would swallow them.
if (process.env.NODE_ENV === 'production') {
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

// ── Central error handler ─────────────────────────────────────
// Must be after all routes. Four arguments = Express error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path} —`, err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: status < 500
      ? err.message
      : 'An unexpected error occurred. Please try again.',
  });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[server] Running on http://localhost:${port}`);
  console.log(`[env] CLIENT_ORIGIN: ${process.env.CLIENT_ORIGIN}`);
  console.log(`[env] PORT: ${process.env.PORT || 5000}`);
  console.log(`[env] JWT_SECRET exists: ${!!process.env.JWT_SECRET}`);
  expiryWarningJob.startExpiryWarningJob();
});
