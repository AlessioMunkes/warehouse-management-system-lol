// ─────────────────────────────────────────────────────────────
// server/src/repositories/photo.repository.js
//
// Photos taken on the floor (migration 041). SQL only.
//
// The picture itself is the `data` column. Nothing outside this file
// reads or writes it, so moving pictures to file storage later is a
// change here and nowhere else: insert would upload and keep a path,
// getImage would fetch by it.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const META = `p.id, p.entity_type, p.entity_id, p.content_type, p.byte_size, p.created_at,
              p.created_by, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS created_by_name`;

const insert = async ({ entityType, entityId, contentType, data, userId }) => {
  const { rows } = await pool.query(
    `INSERT INTO photos (entity_type, entity_id, content_type, byte_size, data, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, entity_type, entity_id, content_type, byte_size, created_at, created_by`,
    [entityType, entityId, contentType, data.length, data, userId ?? null]
  );
  return rows[0];
};

// Everything about the photos of these records except the pictures.
const listFor = async (entityType, entityIds) => {
  const { rows } = await pool.query(
    `SELECT ${META}
       FROM photos p
       LEFT JOIN users u ON u.id = p.created_by
      WHERE p.entity_type = $1 AND p.entity_id = ANY($2::int[])
      ORDER BY p.created_at ASC, p.id ASC`,
    [entityType, entityIds]
  );
  return rows;
};

const getImage = async (id) => {
  const { rows } = await pool.query(`SELECT content_type, data FROM photos WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

// Whether the thing a photo is said to be of exists.
const entityExists = async (entityType, entityId) => {
  const table = entityType === 'picking_slip_item' ? 'picking_slip_items' : 'purchase_orders';
  const { rows } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [entityId]);
  return rows.length > 0;
};

export default { insert, listFor, getImage, entityExists };
