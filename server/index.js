// ─────────────────────────────────────────────────────────────
// server/index.js
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import express          from 'express';
import cors             from 'cors';
import helmet           from 'helmet';
import cookieParser     from 'cookie-parser';
import loginRateLimiter  from './src/middleware/rateLimiter.middleware.js';
import loginRouter       from './src/routes/login.route.js';
import deliveryRouter    from './src/routes/delivery.routes.js';
import volunteerRouter   from './src/routes/volunteer.routes.js';
import decantingRouter   from './src/routes/decanting.routes.js';

// ── Validate required secrets exist at startup ───────────────
if (!process.env.JWT_SECRET) {
  console.error('[server] FATAL: JWT_SECRET is not set. Add it to .env.local and restart.');
  process.exit(1);
}

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
      styleSrc:   ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Tailwind in dev
      imgSrc:     ["'self'", "data:"],           // data: needed for base64 signature images
      connectSrc: ["'self'"],
      fontSrc:    ["'self'"],
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

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/login',      loginRateLimiter, loginRouter);
app.use('/api/deliveries', deliveryRouter);
app.use('/api/volunteers', loginRateLimiter, volunteerRouter);
app.use('/api/decanting',  decantingRouter);

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