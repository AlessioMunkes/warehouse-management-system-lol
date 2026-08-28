// ─────────────────────────────────────────────────────────────
// server/__tests__/setup.js
//
// Runs before every test file. Provides JWT_SECRET so auth middleware
// can sign/verify tokens without a .env file present in CI, and now
// also loads DATABASE_URL from the real .env — needed by the
// donationAdmin/donationIntake integration suites, which hit a real
// Postgres connection via server/src/config/db.js. db.js reads
// DATABASE_URL synchronously at import time and calls process.exit(1)
// if it's missing, so this has to run before any test file's imports
// resolve — which is exactly what Vitest's setupFiles guarantees.
// ─────────────────────────────────────────────────────────────
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.NODE_ENV = 'test';

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[__tests__/setup.js] DATABASE_URL is not set after loading server/.env. ' +
    'The donationAdmin/donationIntake integration suites need a real Postgres ' +
    'connection — check server/.env has DATABASE_URL set.'
  );
}