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

// ── The integration run empties tables ────────────────────────
// Those suites TRUNCATE users, products, stock and more in whatever
// database DATABASE_URL names. Refuse anything that is not on this
// machine unless the person running it has said, in so many words,
// that the database is a throwaway.
if (process.env.WMS_TEST_REAL_DB === '1' && process.env.ALLOW_REMOTE_TEST_DB !== '1') {
  let host = '';
  try { host = new URL(process.env.DATABASE_URL ?? '').hostname; } catch { /* not a URL */ }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      'Integration tests empty the tables they use, and DATABASE_URL does not point at this machine. ' +
      'Point it at a local test database, or set ALLOW_REMOTE_TEST_DB=1 if the remote one is disposable.',
    );
  }
}

// ── Message history writes ────────────────────────────────────
// Every email now goes through features/communications, which records
// it in outbound_messages. A unit test that mocks a sender's own
// repository (and so never loads config/db.js) would otherwise load it
// through this one — and db.js connects to whatever DATABASE_URL the
// .env above names. Stubbed here for every file; the repository's own
// test (communications.test.js) asks for the real module.
import { vi } from 'vitest';

vi.mock('../src/repositories/outboundMessage.repository.js', () => ({
  default: {
    record: vi.fn(async () => ({ id: 1 })),
    list: vi.fn(async () => ({ rows: [], nextCursor: null })),
  },
}));

// ── The database ──────────────────────────────────────────────
// config/db.js stops the process when DATABASE_URL is missing, and
// connects to whatever it names when it is not. A unit test that
// reaches it through a repository it did not mock would therefore
// fail in CI (no .env) and query a real database on a laptop. Stubbed
// here for every file: queries come back empty. A test that mocks
// config/db.js itself still gets its own mock, and the integration
// run (vitest.integration.config.js) asks for the real module.
vi.mock('../src/config/db.js', async (importOriginal) => {
  if (process.env.WMS_TEST_REAL_DB === '1') return importOriginal();
  const empty = async () => ({ rows: [], rowCount: 0 });
  const pool = {
    query: vi.fn(empty),
    connect: vi.fn(async () => ({ query: vi.fn(empty), release: vi.fn() })),
    on: vi.fn(),
    end: vi.fn(async () => {}),
  };
  return { default: pool };
});

// ── Admin settings ────────────────────────────────────────────
// The schedulers and services that used to read constants now read
// features/settings, which opens config/db.js. Stubbed to the
// defaults — the old constants — for every file, so a test that mocks
// a service's own repository still never reaches a real database.
// settings.test.js asks for the real module.
vi.mock('../src/services/settings.service.js', async () => {
  const { defaults } = await import('../src/features/settings/settingsDefinitions.js');
  const get = vi.fn(async (key) => defaults()[key]);
  const getAll = vi.fn(async () => defaults());
  return { get, getAll, list: vi.fn(), update: vi.fn(), default: { get, getAll, list: vi.fn(), update: vi.fn() } };
});

// The operating calendar's closed days live in the database. Every
// service that asks "is the warehouse shut that day?" (reminders, the
// sweep, slip generation) gets "open" in tests unless a test says
// otherwise.
vi.mock('../src/repositories/calendar.repository.js', () => ({
  default: {
    list: vi.fn(async () => []),
    findByDate: vi.fn(async () => null),
    insertMany: vi.fn(async (days) => days.map((d, i) => ({ id: i + 1, ...d }))),
    remove: vi.fn(async () => null),
  },
}));
