// ─────────────────────────────────────────────────────────────
// client/src/services/communicationsAPI.js
//
// The message history (GET /api/communications/messages): every email
// the system has sent, newest first. Unwraps the envelope and maps to
// camelCase, same as the other API modules.
// ─────────────────────────────────────────────────────────────
import { apiGet } from './api';

const toMessage = (row) => ({
  id:          row.id,
  channel:     row.channel,
  type:        row.type,
  recipient:   row.recipient ?? '',
  subject:     row.subject ?? '',
  status:      row.status,
  error:       row.error ?? null,
  relatedType: row.related_type ?? null,
  relatedId:   row.related_id ?? null,
  attemptedAt: row.attempted_at,
  sentByName:  row.sent_by_name ?? null,
});

export const getMessages = async ({ type, status, cursor, limit = 50 } = {}) => {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const body = await apiGet(`/api/communications/messages?${params}`);
  const data = body.data ?? {};
  return {
    messages:   (data.messages ?? []).map(toMessage),
    nextCursor: data.nextCursor ?? null,
    types:      data.types ?? [],
  };
};

export default { getMessages };
