// ─────────────────────────────────────────────────────────────
// src/services/passwordResetAPI.js
//
// Client wrapper around /api/password-reset. Same two jobs as
// userInviteAPI.js: unwrap the { success, data } envelope, and give
// the three calls a stable shape.
//
// No row mapper here — unlike an invite, nothing this flow returns is
// a persisted record the UI lists or edits; request/resolve/confirm
// each return a small, fixed shape with nothing to camelCase.
//
// requestReset's response is the generic message string whether or
// not the email matched an account — see passwordReset.service.js on
// the server. This module does not special-case that; the caller
// (LoginPage.jsx) is the one responsible for not reading anything
// account-specific out of it.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

// ── Public (no session) ────────────────────────────────────────
export const requestReset = async (email) => {
  const body = await apiPost('/api/password-reset/request', { email });
  return body.data; // { message }
};

export const resolveReset = async (token) => {
  const body = await apiGet(`/api/password-reset/${encodeURIComponent(token)}`);
  return body.data; // { valid: true } — throws (with .status/.reason) when not
};

export const confirmReset = async (token, password) => {
  const body = await apiPost(`/api/password-reset/${encodeURIComponent(token)}/confirm`, { password });
  return body.data; // { success: true }
};

export default {
  requestReset,
  resolveReset,
  confirmReset,
};
