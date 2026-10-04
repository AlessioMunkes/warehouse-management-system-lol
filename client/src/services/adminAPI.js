// ─────────────────────────────────────────────────────────────
// client/src/services/adminAPI.js
//
// The admin oversight screens (server/src/routes/admin.routes.js).
// Both routes are requireRole(ADMIN) on the server.
// ─────────────────────────────────────────────────────────────
import { apiGet } from './api';

const unwrap = (res) => res?.data ?? res;

// GET /api/admin/activity?from&to&user&offset — one batch, newest first;
// `hasMore` says there is a next one (offset = how many you already have).
export const getActivity = async ({ from, to, user, offset } = {}) => {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  if (user) q.set('user', user);
  if (offset) q.set('offset', String(offset));
  return unwrap(await apiGet(`/api/admin/activity${q.toString() ? `?${q}` : ''}`));
};

// GET /api/admin/archive
export const getArchive = async () => unwrap(await apiGet('/api/admin/archive'));

export default { getActivity, getArchive };
