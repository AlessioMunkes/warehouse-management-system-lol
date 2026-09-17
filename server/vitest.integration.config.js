import { defineConfig } from 'vitest/config';

// The integration suites only. They need DATABASE_URL pointing at a
// real Postgres 16 — see server/database/test/ for the bootstrap SQL.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setup.js'],
    include: ['**/__tests__/intergration/**/*.test.js'],
  },
});
