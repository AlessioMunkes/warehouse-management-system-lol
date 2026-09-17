// ─────────────────────────────────────────────────────────────
// server/src/repositories/beneficiary.repository.js
//
// Data access for beneficiary centres (ecd_centres). Same UPDATABLE
// whitelist approach as supplier/user/product repositories.
//
// COLUMNS CONFIRMED FROM LIVE QUERIES, NOT FROM schema.sql.
// schema.sql in this repo is empty — every column below is one
// actually selected or written by an existing, working query
// elsewhere (picking.repository.js, dispatch.repository.js's
// getBoard, donation.repository.js): id, name, cohort, contact_name,
// child_count, is_active, approved_at, last_collected_date. No
// column is invented beyond that confirmed set.
//
// THIS TABLE HAD NO APP-LEVEL WRITE PATH AT ALL BEFORE THIS FILE.
// Every existing query either reads ecd_centres or (dispatch's
// collect()) touches only last_collected_date. Centre records were
// reaching the table by direct DB insert outside the app — the
// entire reason a manager-facing directory did not exist. This file
// is the first real create/update/approve path.
//
// APPROVAL IS ITS OWN ACTION, NOT A UPDATABLE FIELD.
// picking.repository.js's createSlip/generateSlips both gate on
// `is_active = TRUE AND approved_at IS NOT NULL` — approval is a
// deliberate manager decision with a timestamp, not a boolean a
// generic PATCH should be able to silently flip. setApproved() is
// separate from updateBeneficiary() for the same reason
// setProductActive() is separate from updateProduct().
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const UPDATABLE = {
  name:        'name',
  cohort:      'cohort',
  contactName: 'contact_name',
  childCount:  'child_count',
};

const BENEFICIARY_COLUMNS = `
  e.id, e.name, e.cohort, e.contact_name, e.child_count,
  e.is_active, e.approved_at, e.last_collected_date
`;

// ── Read ──────────────────────────────────────────────────────
const listBeneficiaries = async ({ includeInactive = false, search = null } = {}) => {
  const params = [];
  const where = [];

  if (!includeInactive) where.push('e.is_active = true');

  if (search) {
    params.push(`%${search}%`);
    where.push(`(e.name ILIKE $${params.length} OR e.contact_name ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT ${BENEFICIARY_COLUMNS}
       FROM ecd_centres e
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY e.is_active DESC, e.name ASC`,
    params
  );
  return rows;
};

const getBeneficiaryById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${BENEFICIARY_COLUMNS} FROM ecd_centres e WHERE e.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

// Case-insensitive on name — ecd_centres has no live UNIQUE
// constraint on file (same situation products was in), so this
// pre-check is the whole duplicate-prevention story.
const findByName = async (name, { excludeId = null } = {}) => {
  const params = [name];
  let sql = `SELECT ${BENEFICIARY_COLUMNS} FROM ecd_centres e WHERE lower(e.name) = lower($1)`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND e.id <> $${params.length}`;
  }
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
};

// ── Write ─────────────────────────────────────────────────────
const insertBeneficiary = async (payload) => {
  const { rows } = await pool.query(
    `INSERT INTO ecd_centres (name, cohort, contact_name, child_count, is_active)
     VALUES ($1, $2::cohort_group, $3, $4, true)
     RETURNING ${BENEFICIARY_COLUMNS.replace(/e\./g, '')}`,
    [payload.name, payload.cohort, payload.contactName ?? null, payload.childCount ?? null]
  );
  return rows[0];
};

const updateBeneficiary = async (id, patch) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(patch[key]);
    sets.push(
      // cohort is an enum column — every other UPDATABLE field is
      // plain text/int and needs no cast.
      key === 'cohort' ? `${column} = $${params.length}::cohort_group` : `${column} = $${params.length}`
    );
  }

  if (!sets.length) return getBeneficiaryById(id);

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE ecd_centres SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING ${BENEFICIARY_COLUMNS.replace(/e\./g, '')}`,
    params
  );
  return rows[0] ?? null;
};

const setBeneficiaryActive = async (id, isActive) => {
  const { rows } = await pool.query(
    `UPDATE ecd_centres SET is_active = $2
      WHERE id = $1
      RETURNING ${BENEFICIARY_COLUMNS.replace(/e\./g, '')}`,
    [id, isActive]
  );
  return rows[0] ?? null;
};

// approved_at is set once and is never cleared back to NULL by this
// path — un-approving a centre is a deactivation (setBeneficiaryActive),
// not a timestamp erasure, the same way products has no "un-create".
const approveBeneficiary = async (id) => {
  const { rows } = await pool.query(
    `UPDATE ecd_centres SET approved_at = NOW()
      WHERE id = $1
      RETURNING ${BENEFICIARY_COLUMNS.replace(/e\./g, '')}`,
    [id]
  );
  return rows[0] ?? null;
};

export default {
  listBeneficiaries,
  getBeneficiaryById,
  findByName,
  insertBeneficiary,
  updateBeneficiary,
  setBeneficiaryActive,
  approveBeneficiary,
};
