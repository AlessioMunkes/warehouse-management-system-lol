// ─────────────────────────────────────────────────────────────
// src/services/accountAPI.js
//
// A signed-in person changing their own sign-in details from Profile.
// Both calls need the current password; the server checks it.
// ─────────────────────────────────────────────────────────────
import { apiPatch } from './api';

// PATCH /api/me/password
export const changePassword = (currentPassword, newPassword) =>
  apiPatch('/api/me/password', { currentPassword, newPassword });

// PATCH /api/me/email → { email }
export const changeEmail = async (currentPassword, email) => {
  const body = await apiPatch('/api/me/email', { currentPassword, email });
  return body?.data?.email ?? email;
};

export default { changePassword, changeEmail };
