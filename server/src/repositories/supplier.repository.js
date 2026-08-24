// ─────────────────────────────────────────────────────────────
// server/src/repositories/supplier.repository.js
//
// Data access for suppliers and supplier prospects. Raw pg, bound
// parameters everywhere, no dynamic SQL built from caller-supplied
// keys — see the note on UPDATABLE below.
//
// NOTHING IS EVER DELETED HERE.
// purchase_orders.supplier_id and delivery_notes.supplier_id are both
// ON DELETE RESTRICT, so the database would refuse a delete on any
// supplier that has ever traded anyway. Rather than write a delete
// that fails on exactly the rows worth keeping, deactivation is the
// only removal path. Prospects can be deleted, because nothing
// references them.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// ── Column whitelist for updates ──────────────────────────────
// The service hands over a camelCase patch object. Mapping it through
// this table means an attacker-supplied key like "is_active" or
// "id" cannot reach the SET clause: unknown keys are dropped, and the
// column names in the SQL come from this file, never from the
// request. That is the whole reason the mapping is explicit rather
// than a snake_case() helper.
const UPDATABLE = {
  name:                 'name',
  contactName:          'contact_name',
  contactEmail:         'contact_email',
  contactPhone:         'contact_phone',
  address:              'address',
  agreementRef:         'agreement_ref',
  paymentTerms:         'payment_terms',
  expectedLeadTimeDays: 'expected_lead_time_days',
  category:             'category',
  notes:                'notes',
};

const SUPPLIER_COLUMNS = `
  s.id, s.name, s.contact_name, s.contact_email, s.contact_phone,
  s.address, s.agreement_ref, s.payment_terms, s.expected_lead_time_days,
  s.category, s.notes, s.is_active, s.created_at,
  s.deactivated_at, s.created_by
`;

// ── Suppliers: read ───────────────────────────────────────────
const listSuppliers = async ({ includeInactive = false, search = null } = {}) => {
  const params = [];
  const where = [];

  if (!includeInactive) where.push('s.is_active = true');

  if (search) {
    params.push(`%${search}%`);
    // ILIKE across the three fields someone would actually search by.
    where.push(`(s.name ILIKE $${params.length}
              OR s.category ILIKE $${params.length}
              OR s.agreement_ref ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT ${SUPPLIER_COLUMNS}
       FROM suppliers s
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY s.is_active DESC, s.name ASC`,
    params
  );
  return rows;
};

const getSupplierById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${SUPPLIER_COLUMNS} FROM suppliers s WHERE s.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

// Case-insensitive, because suppliers.name carries a UNIQUE
// constraint that is case-SENSITIVE. Postgres would happily accept
// both "Bokomo Foods Distribution" and "bokomo foods distribution"
// as distinct rows, which splits that supplier's entire price and
// delivery history in two. Catching it here turns a silent data
// split into a 409 the user can act on.
const findSupplierByName = async (name, { excludeId = null } = {}) => {
  const params = [name];
  let sql = `SELECT ${SUPPLIER_COLUMNS} FROM suppliers s WHERE lower(s.name) = lower($1)`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND s.id <> $${params.length}`;
  }
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
};

// Trading history for the detail panel. Deliberately separate from
// getSupplierById: the directory list renders dozens of suppliers and
// must not pay for five subqueries per row.
const getSupplierStats = async (id) => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM purchase_orders po
         WHERE po.supplier_id = $1)::int AS purchase_order_count,
       (SELECT COUNT(*) FROM purchase_orders po
         WHERE po.supplier_id = $1
           AND po.status NOT IN ('received', 'returned'))::int AS open_purchase_orders,
       (SELECT COUNT(*) FROM delivery_notes dn
         WHERE dn.supplier_id = $1)::int AS delivery_note_count,
       (SELECT MAX(dn.delivery_date) FROM delivery_notes dn
         WHERE dn.supplier_id = $1) AS last_delivery_date,
       -- The follow-up queue for this supplier. Same definition as
       -- the unresolved_discrepancies metric in reportCatalog.js:
       -- a non-zero discrepancy nobody has closed off. Keep the two
       -- in step — if that metric's definition changes, change this.
       (SELECT COUNT(*)
          FROM delivery_note_items dni
          JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
         WHERE dn.supplier_id = $1
           AND COALESCE(dni.discrepancy_quantity, 0) <> 0
           AND dni.discrepancy_resolved = false)::int AS open_discrepancies`,
    [id]
  );
  return rows[0];
};

const getRecentPurchaseOrders = async (id, limit = 10) => {
  const { rows } = await pool.query(
    `SELECT po.id, po.status, po.expected_delivery_date, po.created_at,
            (SELECT COUNT(*) FROM purchase_order_items poi
              WHERE poi.purchase_order_id = po.id)::int AS line_count,
            (SELECT MAX(dn.delivery_date) FROM delivery_notes dn
              WHERE dn.purchase_order_id = po.id) AS delivered_on
       FROM purchase_orders po
      WHERE po.supplier_id = $1
      ORDER BY po.created_at DESC
      LIMIT $2`,
    [id, limit]
  );
  return rows;
};

// ── Suppliers: write ──────────────────────────────────────────
const insertSupplier = async (payload, userId, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO suppliers
       (name, contact_name, contact_email, contact_phone, address,
        agreement_ref, payment_terms, expected_lead_time_days,
        category, notes, created_by, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
     RETURNING ${SUPPLIER_COLUMNS.replace(/s\./g, '')}`,
    [
      payload.name,
      payload.contactName ?? null,
      payload.contactEmail ?? null,
      payload.contactPhone ?? null,
      payload.address ?? null,
      payload.agreementRef ?? null,
      payload.paymentTerms ?? null,
      payload.expectedLeadTimeDays ?? null,
      payload.category ?? null,
      payload.notes ?? null,
      userId ?? null,
    ]
  );
  return rows[0];
};

const updateSupplier = async (id, patch) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }

  // Caller checked this too, but returning the row unchanged rather
  // than emitting `SET` with nothing after it keeps the failure a
  // no-op instead of a syntax error at runtime.
  if (!sets.length) return getSupplierById(id);

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE suppliers SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING ${SUPPLIER_COLUMNS.replace(/s\./g, '')}`,
    params
  );
  return rows[0] ?? null;
};

// is_active, deactivated_at and deactivated_by move together or not
// at all — the CHECK constraint in the migration enforces that, so
// setting them in one statement is not optional tidiness.
const setSupplierActive = async (id, isActive, userId) => {
  const { rows } = await pool.query(
    `UPDATE suppliers
        SET is_active      = $2,
            deactivated_at = CASE WHEN $2 THEN NULL ELSE now() END,
            deactivated_by = CASE WHEN $2 THEN NULL ELSE $3 END
      WHERE id = $1
      RETURNING ${SUPPLIER_COLUMNS.replace(/s\./g, '')}`,
    [id, isActive, userId ?? null]
  );
  return rows[0] ?? null;
};

// ── Prospects ─────────────────────────────────────────────────
const PROSPECT_COLUMNS = `
  id, name, what_they_supply, lead_source, contact_name, contact_email,
  contact_phone, notes, status, converted_supplier_id, created_by,
  created_at, updated_at
`;

const listProspects = async ({ status = null } = {}) => {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ${PROSPECT_COLUMNS} FROM supplier_prospects
     ${where}
     ORDER BY (status = 'open') DESC, created_at DESC`,
    params
  );
  return rows;
};

const getProspectById = async (id, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${PROSPECT_COLUMNS} FROM supplier_prospects WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

const insertProspect = async (payload, userId) => {
  const { rows } = await pool.query(
    `INSERT INTO supplier_prospects
       (name, what_they_supply, lead_source, contact_name, contact_email,
        contact_phone, notes, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8)
     RETURNING ${PROSPECT_COLUMNS}`,
    [
      payload.name,
      payload.whatTheySupply ?? null,
      payload.leadSource ?? null,
      payload.contactName ?? null,
      payload.contactEmail ?? null,
      payload.contactPhone ?? null,
      payload.notes ?? null,
      userId ?? null,
    ]
  );
  return rows[0];
};

const PROSPECT_UPDATABLE = {
  name:           'name',
  whatTheySupply: 'what_they_supply',
  leadSource:     'lead_source',
  contactName:    'contact_name',
  contactEmail:   'contact_email',
  contactPhone:   'contact_phone',
  notes:          'notes',
  status:         'status',
};

const updateProspect = async (id, patch) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(PROSPECT_UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return getProspectById(id);

  sets.push('updated_at = now()');
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE supplier_prospects SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING ${PROSPECT_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

const deleteProspect = async (id) => {
  const { rowCount } = await pool.query(
    `DELETE FROM supplier_prospects WHERE id = $1 AND status <> 'converted'`,
    [id]
  );
  return rowCount > 0;
};

// ── Conversion ────────────────────────────────────────────────
// One transaction, and it must be one: a supplier created without the
// prospect being stamped leaves a lead that looks open forever and
// will be converted again into a duplicate supplier. The prospect row
// is locked FOR UPDATE so two managers converting the same lead at
// the same moment cannot both pass the status check.
const convertProspect = async (prospectId, supplierPayload, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: locked } = await client.query(
      `SELECT ${PROSPECT_COLUMNS} FROM supplier_prospects
        WHERE id = $1 FOR UPDATE`,
      [prospectId]
    );
    const prospect = locked[0];
    if (!prospect) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'not_found' };
    }
    if (prospect.status === 'converted') {
      await client.query('ROLLBACK');
      return { ok: false, code: 'already_converted', prospect };
    }

    const supplier = await insertSupplier(supplierPayload, userId, client);

    const { rows: updated } = await client.query(
      `UPDATE supplier_prospects
          SET status = 'converted', converted_supplier_id = $2, updated_at = now()
        WHERE id = $1
        RETURNING ${PROSPECT_COLUMNS}`,
      [prospectId, supplier.id]
    );

    await client.query('COMMIT');
    return { ok: true, supplier, prospect: updated[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  listSuppliers,
  getSupplierById,
  findSupplierByName,
  getSupplierStats,
  getRecentPurchaseOrders,
  insertSupplier,
  updateSupplier,
  setSupplierActive,
  listProspects,
  getProspectById,
  insertProspect,
  updateProspect,
  deleteProspect,
  convertProspect,
};
