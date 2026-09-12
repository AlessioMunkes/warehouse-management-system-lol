// ─────────────────────────────────────────────────────────────
// src/tests/setup.js
//
// Runs before every test file — extends expect() with the
// jest-dom matchers (toBeInTheDocument, etc.).
// ─────────────────────────────────────────────────────────────
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
afterEach(cleanup);

// jsdom does not provide ResizeObserver, which React 19+ uses in
// layout effects (StepPrimitives.jsx). Without this polyfill, the
// uncaught ReferenceError corrupts subsequent tests' DOM state.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
