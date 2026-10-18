import { defineConfig } from 'vitest/config';

// The integration suites only. They need DATABASE_URL pointing at a
// real Postgres 16 — see server/database/test/ for the bootstrap SQL.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setup.js'],
    // setup.js stubs config/db.js for the unit run; these suites are the
    // ones that need the real connection.
    env: { WMS_TEST_REAL_DB: '1' },
    include: ['**/__tests__/integration/**/*.test.js'],
    // One file at a time: these suites empty the tables they use, so two
    // files running side by side wipe each other's data.
    fileParallelism: false,
  },
});
