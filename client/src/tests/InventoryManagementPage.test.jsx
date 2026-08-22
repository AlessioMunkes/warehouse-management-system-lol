import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the "@" alias in vite.config.js. Without it, any test that
    // transitively imports a shadcn component ("@/components/ui/button")
    // dies at import-analysis before a single assertion runs.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
  },
});