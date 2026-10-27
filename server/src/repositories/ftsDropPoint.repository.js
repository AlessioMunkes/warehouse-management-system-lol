// ─────────────────────────────────────────────────────────────
// server/src/repositories/ftsDropPoint.repository.js
//
// Feed the Soil drop-off sites and the compost logged at them by QR
// code (migration 069). SQL only; the rules are in
// ftsDropPoint.service.js.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const POINT_COLUMNS = `p.id, p.name, p.suburb, p.address, p.public_token, p.is_active, p.created_at`;

const listDropPoints = async ({ includeInactive = false } = {}) => {
  const { rows } = await pool.query(
    `SELECT ${POINT_COLUMNS},
            COUNT(d.id) FILTER (WHERE d.status = 'logged')::int                AS dropoff_count,
            COALESCE(SUM(d.kg_compost) FILTER (WHERE d.status = 'logged'), 0)  AS kg_total,
            MAX(d.submitted_at)                                                AS last_dropoff_at
       FROM fts_drop_points p
       LEFT JOIN fts_dropoffs d ON d.drop_point_id = p.id
      WHERE ($1::boolean OR p.is_active)
      GROUP BY p.id
      ORDER BY lower(p.name)`,
    [includeInactive]
  );
  return rows;
};

const createDropPoint = async ({ name, suburb, address, createdBy }) => {
  const { rows } = await pool.query(
    `INSERT INTO fts_drop_points (name, suburb, address, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, suburb, address, public_token, is_active, created_at`,
    [name, suburb, address, createdBy]
  );
  return rows[0];
};

const PATCH_COLUMNS = { name: 'name', suburb: 'suburb', address: 'address', isActive: 'is_active' };

const updateDropPoint = async (id, patch) => {
  const sets = [];
  const params = [id];
  for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  const { rows } = await pool.query(
    `UPDATE fts_drop_points SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, name, suburb, address, public_token, is_active, created_at`,
    params
  );
  return rows[0] ?? null;
};

// The site a QR code names, for the public form. Only an active site.
const findActiveByToken = async (token) => {
  const { rows } = await pool.query(
    `SELECT id, name, suburb FROM fts_drop_points WHERE public_token = $1 AND is_active`,
    [token]
  );
  return rows[0] ?? null;
};

const createDropoff = async ({ dropPointId, kgCompost, donorName, donorEmail }) => {
  const { rows } = await pool.query(
    `INSERT INTO fts_dropoffs (drop_point_id, kg_compost, donor_name, donor_email)
     VALUES ($1, $2, $3, $4)
     RETURNING id, drop_point_id, kg_compost, donor_name, donor_email, status, submitted_at`,
    [dropPointId, kgCompost, donorName, donorEmail]
  );
  return rows[0];
};

const recordThanks = async (id, status) => {
  await pool.query(`UPDATE fts_dropoffs SET thanks_status = $2 WHERE id = $1`, [id, status]);
};

// The latest drop-offs at every site, newest first, for staff to check.
const listDropoffs = async ({ limit = 100 } = {}) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.drop_point_id, p.name AS drop_point_name, d.kg_compost, d.donor_name,
            d.donor_email IS NOT NULL AS asked_for_thanks, d.thanks_status, d.status, d.submitted_at
       FROM fts_dropoffs d
       JOIN fts_drop_points p ON p.id = d.drop_point_id
      ORDER BY d.submitted_at DESC, d.id DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
};

const setDropoffStatus = async (id, status, reviewedBy) => {
  const { rows } = await pool.query(
    `UPDATE fts_dropoffs SET status = $2, reviewed_by = $3, reviewed_at = now()
      WHERE id = $1 RETURNING id, status`,
    [id, status, reviewedBy]
  );
  return rows[0] ?? null;
};

export default {
  listDropPoints, createDropPoint, updateDropPoint, findActiveByToken,
  createDropoff, recordThanks, listDropoffs, setDropoffStatus,
};
