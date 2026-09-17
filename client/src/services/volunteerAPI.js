// ─────────────────────────────────────────────────────────────
// src/services/volunteerAPI.js
//
// Client wrapper around the guest-log half of /api/volunteers. Same
// two jobs as productAPI.js and userAPI.js: unwrap the
// { success, data } envelope, and map snake_case to camelCase in one
// place rather than in every component that touches a row.
//
// Sign-in is not here. It is called straight from AuthContext, because
// it is the call that CREATES the session — routing it through a
// module that assumes one would be backwards.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

export const toVisit = (row) => ({
  id:            row.id,
  fullName:      row.full_name ?? '',
  source:        row.source ?? '',
  signedInAt:    row.signed_in_at ?? null,
  signedOutAt:   row.signed_out_at ?? null,
  // INTEGER from the server, but node-postgres hands back NUMERIC as a
  // string and this has been an int both ways before. Number() with a
  // null guard, same as reorderThreshold in productAPI.js — a visit
  // still open has no duration, and 0 would be a lie.
  minutesOnSite: row.minutes_on_site === null || row.minutes_on_site === undefined
    ? null
    : Number(row.minutes_on_site),
});

export const getGuestLog = async ({ search = '', from = '', to = '' } = {}) => {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  const qs = params.toString();
  const body = await apiGet(`/api/volunteers${qs ? `?${qs}` : ''}`);
  return (body.data ?? []).map(toVisit);
};

// POST, not PATCH: this records an event that happened at a door, it
// does not edit a field. The server stamps the time — a client clock
// has no business deciding when somebody left the building.
export const signOutVisit = async (id) => {
  const body = await apiPost(`/api/volunteers/${id}/sign-out`, {});
  return toVisit(body.data ?? {});
};

export default { getGuestLog, signOutVisit };
