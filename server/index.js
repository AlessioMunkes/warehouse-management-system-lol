// ─────────────────────────────────────────────────────────────
// server/index.js
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import express          from 'express';
import cors             from 'cors';
import path             from 'path';
import { fileURLToPath } from 'url';
import helmet           from 'helmet';
import cookieParser     from 'cookie-parser';
import loginRateLimiter  from './src/middleware/rateLimiter.middleware.js';
import loginRouter       from './src/routes/login.route.js';
import deliveryRouter    from './src/routes/delivery.routes.js';
import volunteerRouter   from './src/routes/volunteer.routes.js';
import decantingRouter   from './src/routes/decanting.routes.js';
import stockRouter       from './src/routes/stock.routes.js';
import pickingRouter     from './src/routes/picking.routes.js';

// ── Validate required secrets exist at startup ───────────────
if (!process.env.JWT_SECRET) {
  console.error('[server] FATAL: JWT_SECRET is not set. Add it to .env.local and restart.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const port = process.env.PORT || 5000;

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
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(cors({
  origin:      process.env.CLIENT_ORIGIN || 'http://localhost:5173',
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
app.use('/api/deliveries', deliveryRouter);
app.use('/api/volunteers', loginRateLimiter, volunteerRouter);
app.use('/api/decanting',  decantingRouter);
app.use('/api/stock',      stockRouter);
app.use('/api/picking',    pickingRouter);

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
});