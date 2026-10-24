// ─────────────────────────────────────────────────────────────
// server/src/repositories/centreLocation.repository.js
//
// Where each beneficiary centre is (migration 050): the location part of
// editing a centre on Beneficiaries, and the one-off
// scripts/locateEcdCentres.mjs. Only
// the location columns are read or written here; the rest of a centre
// stays with beneficiary.repository.js.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const COLUMNS = `
  e.id, e.name, e.cohort::text AS cohort, e.is_active, e.child_count,
  e.address, e.suburb, e.latitude, e.longitude,
  e.location_source, e.location_note, e.location_updated_at,
  NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS location_updated_by_name`;

const listLocations = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}
       FROM ecd_centres e
       LEFT JOIN users u ON u.id = e.location_updated_by
      ORDER BY e.is_active DESC, e.name ASC`
  );
  return rows;
};

const getLocation = async (id, db = pool) => {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}
       FROM ecd_centres e
       LEFT JOIN users u ON u.id = e.location_updated_by
      WHERE e.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

/** Writes every location field of one centre; null clears a field. */
const setLocation = async (id, { address, suburb, latitude, longitude, source, note, userId }, db = pool) => {
  const { rowCount } = await db.query(
    `UPDATE ecd_centres
        SET address = $2, suburb = $3, latitude = $4, longitude = $5,
            location_source = $6, location_note = $7,
            location_updated_at = NOW(), location_updated_by = $8
      WHERE id = $1`,
    [id, address, suburb, latitude, longitude, source, note, userId ?? null]
  );
  return rowCount > 0;
};

export default { listLocations, getLocation, setLocation };
