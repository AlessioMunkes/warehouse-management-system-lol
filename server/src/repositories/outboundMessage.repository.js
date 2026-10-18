// ─────────────────────────────────────────────────────────────
// server/src/repositories/outboundMessage.repository.js
//
// outbound_messages — one row per message sent (migration 032).
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const record = async ({
  channel = 'email', type, recipient = null, subject = null, status, error = null,
  relatedType = null, relatedId = null, sentBy = null, attemptedAt = new Date(),
}) => {
  const { rows } = await pool.query(
    `INSERT INTO outbound_messages
       (channel, type, recipient, subject, status, error, related_type, related_id, sent_by, attempted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [channel, type, recipient, subject, status, error, relatedType,
      relatedId === null || relatedId === undefined ? null : String(relatedId), sentBy, attemptedAt],
  );
  return rows[0];
};

// Newest first, keyset-paged on (attempted_at, id) — the same reason
// the stock ledger pages that way: rows are only ever added, and an
// OFFSET would skip or repeat them as new sends arrive mid-browse.
// One extra row tells the caller whether there is another page.
const list = async ({ type = null, status = null, limit = 50, cursor = null } = {}) => {
  const params = [type, status];
  let where = `($1::text IS NULL OR m.type = $1) AND ($2::text IS NULL OR m.status = $2)`;
  if (cursor) {
    params.push(cursor.attemptedAt, cursor.id);
    where += ` AND (m.attempted_at, m.id) < ($3::timestamptz, $4::bigint)`;
  }
  params.push(limit + 1);

  const { rows } = await pool.query(
    `SELECT m.id, m.channel, m.type, m.recipient, m.subject, m.status, m.error,
            m.related_type, m.related_id, m.attempted_at,
            u.first_name AS sent_by_name
       FROM outbound_messages m
       LEFT JOIN users u ON u.id = m.sent_by
      WHERE ${where}
      ORDER BY m.attempted_at DESC, m.id DESC
      LIMIT $${params.length}`,
    params,
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: hasMore && last ? { attemptedAt: last.attempted_at, id: last.id } : null,
  };
};

export default { record, list };
