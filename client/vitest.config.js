import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the "@" alias in vite.config.js. Without it, any test that
    // transitively imports a shadcn component ("@/components/ui/button")
    // dies at import-analysis before a single assertion runs — the app
    // builds fine, only the test runner can't resolve the path.
    //
    // import.meta.url rather than __dirname: this config is ESM, and
    // unlike vite.config.js it isn't in eslint's globalIgnores, so
    // __dirname would trip no-undef.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
  },
});
