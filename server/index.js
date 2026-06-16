// ─────────────────────────────────────────────────────────────
// server/index.js
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import express          from 'express';
import cors             from 'cors';
import cookieParser     from 'cookie-parser';
import loginRateLimiter from './src/middleware/rateLimiter.middleware.js';
import loginRouter      from './src/routes/login.route.js';
import deliveryRouter   from './src/routes/delivery.routes.js';

if (!process.env.JWT_SECRET) {
  console.error('[server] FATAL: JWT_SECRET is not set. Add it to .env.local and restart.');
  process.exit(1);
}

const app  = express();
const port = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser()); // needed to read req.cookies
app.use(cors({
  origin:      process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true, // required for cookies to be sent cross-origin in dev
}));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/login',      loginRateLimiter, loginRouter);
app.use('/api/deliveries', deliveryRouter);

// ── Central error handler ────────────────────────────────────
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