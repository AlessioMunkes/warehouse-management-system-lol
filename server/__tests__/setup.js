// ─────────────────────────────────────────────────────────────
// server/__tests__/setup.js
//
// Runs before every test file. Provides JWT_SECRET so auth middleware
// can sign/verify tokens without a .env file present in CI, and loads
// DATABASE_URL from .env when there is one, for the integration
// suites (which reach a real Postgres via src/config/db.js).
//
// It deliberately does NOT require DATABASE_URL. It used to throw when
// the variable was missing, and because this file runs before EVERY
// test file that took down all 61 suites — including every mocked unit
// test that never opens a connection — anywhere without a .env, CI
// first among them. The integration suites are excluded from the
// default run in vitest.config.js instead; see `npm run test:integration`.
// ─────────────────────────────────────────────────────────────
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.NODE_ENV = 'test';
