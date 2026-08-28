import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./client/src/tests/setup.js', './server/__tests__/setup.js'],
  },
});
