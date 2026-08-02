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
