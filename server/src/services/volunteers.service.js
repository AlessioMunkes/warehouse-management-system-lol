// ─────────────────────────────────────────────────────────────
// src/services/volunteers.js
//
// STUB — records a guest sign-in against the future `volunteers`
// table. Right now it only logs and buffers to localStorage so
// nothing is lost during development.
//
// TODO (Phase 2): replace the stub body with the apiPost call
// below once POST /api/volunteers/sign-in exists server-side.
// Nothing outside this file should need to change.
// ─────────────────────────────────────────────────────────────
// import { apiPost } from './api';

const STUB_KEY = 'wms_guest_signins_stub';

export const recordGuestSignIn = async ({ name }) => {
  const record = {
    name,
    signedInAt: new Date().toISOString(), // UTC — server will overwrite
    source: 'guest_login',
  };

  // ── REAL IMPLEMENTATION (commented until endpoint exists) ──
  // return apiPost('/api/volunteers/sign-in', { name });

  // ── STUB BEHAVIOUR ────────────────────────────────────────
  console.info('[STUB] volunteer sign-in →', record);
  try {
    const buffer = JSON.parse(localStorage.getItem(STUB_KEY) || '[]');
    buffer.push(record);
    localStorage.setItem(STUB_KEY, JSON.stringify(buffer));
  } catch {
    // Buffer is best-effort only — never block the login on it
  }

  return { id: `stub-${Date.now()}`, ...record };
};

// Dev helper — call from the console to inspect buffered sign-ins
export const _getStubSignIns = () =>
  JSON.parse(localStorage.getItem(STUB_KEY) || '[]');