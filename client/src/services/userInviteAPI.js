// ─────────────────────────────────────────────────────────────
// src/services/userInviteAPI.js
//
// Client wrapper around /api/invites. Same two jobs as userAPI.js:
// unwrap the { success, data } envelope, and map snake_case to
// camelCase in one place so every screen reading an invite gets the
// same shape.
//
// toInvite deliberately never sees a token or token_hash — the server
// only ever puts the raw token in the create/resend response body,
// never in anything this mapper touches (see listPendingInvites,
// resolveInvite).
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';
import { toUser } from './userAPI';

// ── Row mapper ────────────────────────────────────────────────
export const toInvite = (row) => ({
  id:          row.id,
  email:       row.email,
  role:        row.role,
  createdAt:   row.createdAt,
  lastSentAt:  row.lastSentAt,
  expiresAt:   row.expiresAt,
  resendCount: row.resendCount,
  revokedAt:   row.revokedAt ?? null,
  acceptedAt:  row.acceptedAt ?? null,
  // Only present when this row came from resolveInvite (the public
  // accept-page lookup) — undefined everywhere else.
  inviterName: row.inviterName ?? null,
  // Persisted outcome of the last send attempt (migration 024):
  // 'sent' | 'stubbed' | 'failed' | null. Lets the pending-invites
  // list flag a failed or stubbed send on a later visit, not only in
  // the moment right after Create/Resend.
  emailStatus:      row.emailStatus ?? null,
  emailError:       row.emailError ?? null,
  emailAttemptedAt: row.emailAttemptedAt ?? null,
});

// The create/resend response carries the invite PLUS the one-time
// raw token and a ready-to-share url — shaped separately from
// toInvite so nothing accidentally drops them on the floor.
const toInviteWithLink = (data) => ({
  invite: toInvite(data.invite ?? {}),
  token:  data.token,
  url:    data.url,
  // { sent, stubbed, error } from the server, or undefined if for any
  // reason no attempt was made — left as-is rather than defaulted to
  // any sent/failed value, so the UI can never claim an email went
  // out when nothing tried to send one.
  email:  data.email,
});

// ── Admin ─────────────────────────────────────────────────────
export const createInvite = async ({ email, role }) => {
  const body = await apiPost('/api/invites', { email, role });
  return toInviteWithLink(body.data ?? {});
};

export const getPendingInvites = async () => {
  const body = await apiGet('/api/invites');
  return (body.data ?? []).map(toInvite);
};

export const resendInvite = async (id) => {
  const body = await apiPost(`/api/invites/${id}/resend`);
  return toInviteWithLink(body.data ?? {});
};

export const revokeInvite = async (id) => {
  const body = await apiPost(`/api/invites/${id}/revoke`);
  return toInvite(body.data ?? {});
};

// ── Public (no session) ────────────────────────────────────────
export const resolveInvite = async (token) => {
  const body = await apiGet(`/api/invites/${encodeURIComponent(token)}`);
  return toInvite(body.data ?? {});
};

// The server returns exactly a users row shape (id, username,
// first_name, last_name, role, is_active, archived_at) — same mapper
// userAPI.js uses for every other users response, reused rather than
// redefined so the two can't drift on what a user row looks like.
export const acceptInvite = async (token, payload) => {
  const body = await apiPost(`/api/invites/${encodeURIComponent(token)}/accept`, payload);
  return toUser(body.data ?? {});
};

export default {
  createInvite, getPendingInvites, resendInvite, revokeInvite,
  resolveInvite, acceptInvite,
};
