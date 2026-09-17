// Live verification for the Issue 5 access tightening:
// POST /api/donations/pending/flags/:flagId/resolve must be admin-only.
//  - manager token  -> 403 on both an intake-linked flag and a standalone flag
//  - admin token    -> 200 on both; intake donation commits once last flag resolves
//  - standalone flag resolved with explicit fields -> product row persisted
// Throwaway fixtures are tagged and deleted at the end (nothing kept), and the
// greenlit cleanup batch row pending #27 + flags #149/#150 is removed here too.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const API = 'http://localhost:5000/api';
const TAG = `access-check-${Date.now()}`;

const tokenFor = async (role) => {
  const { rows } = await pool.query(`SELECT id, username, role FROM users WHERE role = $1 AND is_active = true ORDER BY id LIMIT 1;`, [role]);
  if (!rows[0]) throw new Error(`No active ${role} user.`);
  return jwt.sign({ id: rows[0].id, username: rows[0].username, role: rows[0].role }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const resolveFlag = async (flagId, token, body) => {
  const res = await fetch(`${API}/donations/pending/flags/${flagId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `wms_token=${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const assert = (name, pass, extra = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${extra ? ` — ${extra}` : ''}`);
  if (!pass) process.exitCode = 1;
};

const run = async () => {
  const adminToken = await tokenFor('admin');
  const managerToken = await tokenFor('manager');

  // Pre-clean any leftovers from a previously aborted run of this script.
  await pool.query(`DELETE FROM warehouse_manager_flags WHERE product_id IN (SELECT id FROM products WHERE stock_keeping_unit LIKE 'ACCESSCHECK-%')`);
  await pool.query(`DELETE FROM pending_donation_items WHERE pending_donation_id IN (SELECT id FROM pending_donations WHERE draft_snapshot->>'source' LIKE 'access-check-%')`);
  await pool.query(`DELETE FROM pending_donations WHERE draft_snapshot->>'source' LIKE 'access-check-%'`);
  await pool.query(`DELETE FROM products WHERE stock_keeping_unit LIKE 'ACCESSCHECK-%'`);

  // ── Fixture: intake-linked pending donation with 2 unmatched items ──
  const pd = await pool.query(
    `INSERT INTO pending_donations (donor_name, donor_contact, estimated_value_zar, donation_category, status, created_by, draft_snapshot)
     VALUES ($1, 'access-check@example.com', '10.00', 'recipe_food', 'awaiting_resolution', (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1), $2) RETURNING id`,
    [`Access Check Donor ${TAG}`, JSON.stringify({ source: TAG })]
  );
  const pendingId = pd.rows[0].id;
  const flagIds = [];
  for (const line of [1, 2]) {
    await pool.query(
      `INSERT INTO pending_donation_items (pending_donation_id, line_no, description, quantity, unit, status, routing_status)
       VALUES ($1, $2, $3, 1, 'kg', 'awaiting_resolution', 'flagged')`,
      [pendingId, line, `Access check item L${line} ${TAG}`]
    );
    // Flags need product rows (product_id NOT NULL): inactive placeholders.
    const prod = await pool.query(
      `INSERT INTO products (name, stock_keeping_unit, storage_type, default_unit, is_active)
       VALUES ($1, $2, 'dry', 'kg', false) RETURNING id`,
      [`Access Check Placeholder L${line} ${TAG}`, `ACCESSCHECK-${pendingId}-L${line}`]
    );
    const flag = await pool.query(
      `INSERT INTO warehouse_manager_flags (product_id, quantity_kg, status, reason, created_by)
       VALUES ($1, 1, 'pending_classification', 'Access check fixture', (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1)) RETURNING id`,
      [prod.rows[0].id]
    );
    flagIds.push(flag.rows[0].id);
    // The intake commit path keys off flag.pending_donation_id (service line
    // ~403), so hand-built intake fixtures MUST link the flag to both the
    // pending donation and its item — a flag with a NULL pending_donation_id
    // is treated as standalone by design.
    const itemRow = await pool.query(
      `SELECT id FROM pending_donation_items WHERE pending_donation_id = $1 AND line_no = $2`,
      [pendingId, line]
    );
    await pool.query(
      `UPDATE warehouse_manager_flags SET pending_donation_id = $1, pending_donation_item_id = $2 WHERE id = $3`,
      [pendingId, itemRow.rows[0].id, flag.rows[0].id]
    );
    await pool.query(`UPDATE pending_donation_items SET flag_id = $1 WHERE pending_donation_id = $2 AND line_no = $3`, [flag.rows[0].id, pendingId, line]);
  }

  // ── Fixture: standalone flag (no pending donation link) ──
  const standaloneProd = await pool.query(
    `INSERT INTO products (name, stock_keeping_unit, storage_type, default_unit, is_active)
     VALUES ($1, $2, 'dry', 'units', false) RETURNING id`,
    [`Access Check Standalone ${TAG}`, `ACCESSCHECK-STANDALONE-${pendingId}`]
  );
  const standaloneFlag = (await pool.query(
    `INSERT INTO warehouse_manager_flags (product_id, quantity_kg, status, reason, created_by)
     VALUES ($1, 1, 'pending_classification', 'Standalone access check', (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1)) RETURNING id`,
    [standaloneProd.rows[0].id]
  )).rows[0].id;

  console.log(`fixtures: pending #${pendingId}, intake flags #${flagIds.join(', #')}, standalone flag #${standaloneFlag}`);

  // ── Manager must be rejected on BOTH flag types ──
  const mIntake = await resolveFlag(flagIds[0], managerToken, { accepted: true, category: 'recipe_food' });
  assert('manager resolve intake-linked flag -> 403', mIntake.status === 403, `got ${mIntake.status}`);
  const mStandalone = await resolveFlag(standaloneFlag, managerToken, { accepted: true, name: 'X', category: 'recipe_food' });
  assert('manager resolve standalone flag -> 403', mStandalone.status === 403, `got ${mStandalone.status}`);
  const untouched = await pool.query(`SELECT status FROM warehouse_manager_flags WHERE id = ANY($1::int[])`, [[flagIds[0], standaloneFlag]]);
  assert('flags untouched after manager 403s', untouched.rows.every((r) => r.status === 'pending_classification'));
  // ── Admin resolves everything: reject L1, accept L2 (commits), standalone explicit fields ──
  const aReject = await resolveFlag(flagIds[0], adminToken, { accepted: false, reason: 'Access check rejection' });
  assert('admin reject intake flag -> 200', aReject.status === 200, `got ${aReject.status}`);
  const aAccept = await resolveFlag(flagIds[1], adminToken, { accepted: true, category: 'recipe_food' });
  assert('admin accept intake flag -> 200', aAccept.status === 200, `got ${aAccept.status}`);
  const aStandalone = await resolveFlag(standaloneFlag, adminToken, {
    accepted: true, name: `Access Check Resolved ${TAG}`, storageType: 'dry', defaultUnit: 'units', category: 'recipe_food',
  });
  assert('admin resolve standalone flag -> 200', aStandalone.status === 200, `got ${aStandalone.status}`);

  const pdAfter = await pool.query(`SELECT status, committed_donation_id FROM pending_donations WHERE id = $1`, [pendingId]);
  assert('intake donation committed after last flag resolved', pdAfter.rows[0].status === 'committed' && pdAfter.rows[0].committed_donation_id != null,
    `status=${pdAfter.rows[0].status} committed_donation_id=${pdAfter.rows[0].committed_donation_id}`);

  const prodAfter = await pool.query(
    `SELECT name, stock_keeping_unit AS sku, storage_type, default_unit, is_active FROM products WHERE id = $1`,
    [standaloneProd.rows[0].id]
  );
  assert('standalone product persisted with submitted fields', prodAfter.rows[0].name === `Access Check Resolved ${TAG}` && prodAfter.rows[0].is_active === true,
    JSON.stringify(prodAfter.rows[0]));

  // Item rows must have been routed by the intake path (not left awaiting).
  const itemsAfter = await pool.query(`SELECT status FROM pending_donation_items WHERE pending_donation_id = $1 ORDER BY line_no`, [pendingId]);
  assert('item 1 rejected, item 2 resolved-or-committed via intake path',
    itemsAfter.rows[0].status === 'rejected' && ['resolved', 'committed'].includes(itemsAfter.rows[1].status),
    JSON.stringify(itemsAfter.rows));

  // ── Greenlit cleanup batch: pending #27 + flags #149/#150 ──
  await pool.query(`UPDATE pending_donation_items SET flag_id = NULL WHERE pending_donation_id = 27`);
  await pool.query(`DELETE FROM pending_donation_items WHERE pending_donation_id = 27`);
  await pool.query(`DELETE FROM warehouse_manager_flags WHERE id IN (149, 150)`);
  const del27 = await pool.query(`DELETE FROM pending_donations WHERE id = 27 RETURNING id`);
  const still27 = await pool.query(`SELECT id FROM pending_donations WHERE id = 27`);
  assert('greenlit fixture pending #27 (and flags #149/#150) removed', still27.rowCount === 0,
    del27.rowCount === 1 ? 'deleted now' : 'was already absent (removed by an earlier partial run)');

  // ── Remove this run's throwaway fixtures ──
  await pool.query(`UPDATE pending_donation_items SET flag_id = NULL WHERE pending_donation_id = $1`, [pendingId]);
  await pool.query(`DELETE FROM pending_donation_items WHERE pending_donation_id = $1`, [pendingId]);
  await pool.query(`DELETE FROM warehouse_manager_flags WHERE id = ANY($1::int[])`, [[...flagIds, standaloneFlag]]);
  await pool.query(`DELETE FROM pending_donations WHERE id = $1`, [pendingId]);
  await pool.query(`DELETE FROM products WHERE stock_keeping_unit LIKE 'ACCESSCHECK-%'`);
  console.log('throwaway fixtures removed.');
};
run().catch((e) => { console.error(e); process.exit(1); });
