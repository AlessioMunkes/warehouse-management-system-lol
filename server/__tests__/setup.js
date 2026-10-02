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

// ── Message history writes ────────────────────────────────────
// Every email now goes through features/communications, which records
// it in outbound_messages. A unit test that mocks a sender's own
// repository (and so never loads config/db.js) would otherwise load it
// through this one — and db.js connects to whatever DATABASE_URL the
// .env above names. Stubbed here for every file; the repository's own
// test (communications.test.js) asks for the real module.
import { vi } from 'vitest';

vi.mock('../src/features/communications/outboundMessage.repository.js', () => ({
  default: {
    record: vi.fn(async () => ({ id: 1 })),
    list: vi.fn(async () => ({ rows: [], nextCursor: null })),
  },
}));

// ── Admin settings ────────────────────────────────────────────
// The schedulers and services that used to read constants now read
// features/settings, which opens config/db.js. Stubbed to the
// defaults — the old constants — for every file, so a test that mocks
// a service's own repository still never reaches a real database.
// settings.test.js asks for the real module.
vi.mock('../src/features/settings/settings.service.js', async () => {
  const { defaults } = await import('../src/features/settings/settingsDefinitions.js');
  const get = vi.fn(async (key) => defaults()[key]);
  const getAll = vi.fn(async () => defaults());
  return { get, getAll, list: vi.fn(), update: vi.fn(), default: { get, getAll, list: vi.fn(), update: vi.fn() } };
});
