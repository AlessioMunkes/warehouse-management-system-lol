// ─────────────────────────────────────────────────────────────
// src/services/accountAPI.js
//
// A signed-in person's own account: their sign-in details from Profile
// (both need the current password; the server checks it) and the
// language they read the floor screens in.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPatch } from './api';

// PATCH /api/me/password
export const changePassword = (currentPassword, newPassword) =>
  apiPatch('/api/me/password', { currentPassword, newPassword });

// PATCH /api/me/email → { email }
export const changeEmail = async (currentPassword, email) => {
  const body = await apiPatch('/api/me/email', { currentPassword, email });
  return body?.data?.email ?? email;
};

// GET /api/me/language → the saved code, or null
export const getLanguage = async () => {
  const res = await apiGet('/api/me/language');
  return res?.data?.language ?? null;
};

// PATCH /api/me/language
export const setLanguage = (language) => apiPatch('/api/me/language', { language });

export default { changePassword, changeEmail, getLanguage, setLanguage };
