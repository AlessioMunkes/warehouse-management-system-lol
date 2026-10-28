// ─────────────────────────────────────────────────────────────
// server/src/repositories/kitchen.repository.js
//
// Soup kitchens and Dignity Kitchens (migration 068): who they are and
// how many adults each feeds per collection. SQL only; the rules are in
// kitchen.service.js.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const COLUMNS = `id, kind::text AS kind, name, adult_count, contact_name, contact_phone, address, is_active, created_at`;

const listKitchens = async ({ includeInactive = false } = {}) => {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS},
            -- Its pallets so far, matched by kind and name like adults served.
            (SELECT COUNT(*)::int FROM picking_slips ps
              WHERE ps.beneficiary_kind = k.kind AND lower(ps.beneficiary_name) = lower(k.name)) AS slip_count
       FROM kitchens k
      WHERE ($1::boolean OR k.is_active)
      ORDER BY k.kind, lower(k.name)`,
    [includeInactive]
  );
  return rows;
};

const getKitchen = async (id) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM kitchens WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

const createKitchen = async (k) => {
  const { rows } = await pool.query(
    `INSERT INTO kitchens (kind, name, adult_count, contact_name, contact_phone, address)
     VALUES ($1::beneficiary_type, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [k.kind, k.name, k.adultCount, k.contactName, k.contactPhone, k.address]
  );
  return rows[0];
};

const PATCH_COLUMNS = {
  name: 'name', adultCount: 'adult_count', contactName: 'contact_name',
  contactPhone: 'contact_phone', address: 'address', isActive: 'is_active',
};

const updateKitchen = async (id, patch) => {
  const sets = [];
  const params = [id];
  for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  const { rows } = await pool.query(
    `UPDATE kitchens SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

export default { listKitchens, getKitchen, createKitchen, updateKitchen };
