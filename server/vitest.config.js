import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setup.js'],
    // The two suites under __tests__/intergration/ open a real Postgres
    // connection and are excluded from the default run: CI has no
    // database, and a unit suite should never need one. Run them
    // against a real instance with `npm run test:integration`.
    exclude: ['**/node_modules/**', '**/__tests__/intergration/**'],
  },
});
