// ─────────────────────────────────────────────────────────────
// client/src/services/adminAPI.js
//
// The admin oversight screens (server/src/routes/admin.routes.js).
// Both routes are requireRole(ADMIN) on the server.
// ─────────────────────────────────────────────────────────────
import { apiGet } from './api';

const unwrap = (res) => res?.data ?? res;

// GET /api/admin/activity?from&to&user
export const getActivity = async ({ from, to, user } = {}) => {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  if (user) q.set('user', user);
  return unwrap(await apiGet(`/api/admin/activity${q.toString() ? `?${q}` : ''}`));
};

// GET /api/admin/archive
export const getArchive = async () => unwrap(await apiGet('/api/admin/archive'));

export default { getActivity, getArchive };
