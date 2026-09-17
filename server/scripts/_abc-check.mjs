// Live verification for Parts A & B:
//  A: GET /api/donations/intake/products/search?name=... — hit returns active
//     products, miss returns [], empty term returns [], unauth 401.
//  B: GET /api/donations/admin/pending-classifications — donation-linked rows
//     carry donation_items (the FULL sibling list), standalone rows do not.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const API = 'http://localhost:5000/api';
const TAG = `abc-check-${Date.now()}`;

const tokenFor = async (role) => {
  const { rows } = await pool.query(`SELECT id, username, role FROM users WHERE role = $1 AND is_active = true ORDER BY id LIMIT 1;`, [role]);
  if (!rows[0]) throw new Error(`No active ${role} user.`);
  return jwt.sign({ id: rows[0].id, username: rows[0].username, role: rows[0].role }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const assert = (name, pass, extra = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${extra ? ` — ${extra}` : ''}`);
  if (!pass) process.exitCode = 1;
};

const run = async () => {
  const adminToken = await tokenFor('admin');
  const workerToken = await tokenFor('warehouse_worker');
  const cookie = (t) => ({ 'Content-Type': 'application/json', Cookie: `wms_token=${t}` });

  // ── Part A fixture: one active product to find ──
  // Pre-clean leftovers from any earlier failed run (SKU is unique).
  await pool.query(`DELETE FROM products WHERE stock_keeping_unit IN ('ABCCHECK-SKU', 'ABCCHECK-FLAG')`);
  const prod = await pool.query(
    `INSERT INTO products (name, stock_keeping_unit, storage_type, default_unit, is_active)
     VALUES ($1, 'ABCCHECK-SKU', 'dry', 'units', true) RETURNING id, name`,
    [`Abccheck Search Tin ${TAG}`]
  );

  const search = async (token, name) => {
    const res = await fetch(`${API}/donations/intake/products/search?name=${encodeURIComponent(name)}`, { headers: cookie(token) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  const hitWorker = await search(workerToken, 'Abccheck Search Tin');
  assert('Part A: worker token search HIT -> 200 with the fixture product', hitWorker.status === 200 && Array.isArray(hitWorker.json?.data) && hitWorker.json.data.some((r) => r.name === `Abccheck Search Tin ${TAG}`), JSON.stringify(hitWorker.json?.data?.[0] ?? null));
  assert('Part A: hit rows carry id/name/sku/weight_kg', ['id', 'name', 'sku', 'weight_kg'].every((k) => k in (hitWorker.json?.data?.[0] ?? {})));

  const miss = await search(workerToken, 'No Such Product Exists QQQ');
  assert('Part A: search MISS -> 200 with empty list', miss.status === 200 && Array.isArray(miss.json?.data) && miss.json.data.length === 0);

  const empty = await search(workerToken, '');
  assert('Part A: empty term -> 200 with empty list', empty.status === 200 && empty.json?.data?.length === 0);

  const unauth = await fetch(`${API}/donations/intake/products/search?name=x`);
  assert('Part A: unauthenticated -> 401', unauth.status === 401, `got ${unauth.status}`);

  // ── Part B fixture: pending donation with 3 items, 1 flagged ──
  const pd = await pool.query(
    `INSERT INTO pending_donations (donor_name, donor_contact, estimated_value_zar, donation_category, status, created_by, draft_snapshot)
     VALUES ($1, 'abc-check@example.com', '30.00', 'recipe_food', 'awaiting_resolution', (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1), $2) RETURNING id`,
    [`Abc Check Donor ${TAG}`, JSON.stringify({ source: TAG })]
  );
  const pendingId = pd.rows[0].id;
  const itemIds = [];
  for (const line of [1, 2, 3]) {
    const it = await pool.query(
      `INSERT INTO pending_donation_items (pending_donation_id, line_no, description, quantity, unit, status, routing_status)
       VALUES ($1, $2, $3, $4, 'kg', 'awaiting_resolution', 'flagged') RETURNING id`,
      [pendingId, line, `Abc check item L${line} ${TAG}`, line]
    );
    itemIds.push(it.rows[0].id);
  }
  // Flag only line 1; flags need a product row (product_id NOT NULL).
  const flagProd = await pool.query(
    `INSERT INTO products (name, stock_keeping_unit, storage_type, default_unit, is_active)
     VALUES ($1, 'ABCCHECK-FLAG', 'dry', 'units', false) RETURNING id`,
    [`[Unclassified] Abc flag ${TAG}`]
  );
  const flag = await pool.query(
    `INSERT INTO warehouse_manager_flags (product_id, status, quantity_kg, reason, created_by, pending_donation_id, pending_donation_item_id)
     VALUES ($1, 'pending_classification', 2, 'unmatched intake line', (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1), $2, $3) RETURNING id`,
    [flagProd.rows[0].id, pendingId, itemIds[0]]
  );

  const listRes = await fetch(`${API}/donations/admin/pending-classifications`, { headers: cookie(adminToken) });
  const list = await listRes.json();
  const row = (list.data || []).find((r) => r.flag_id === flag.rows[0].id);
  assert('Part B: flagged row present in admin queue', Boolean(row), row ? `flag #${row.flag_id}` : 'missing');
  const items = row?.donation_items || [];
  assert('Part B: donation_items = FULL 3-item sibling list (not just the flagged line)', items.length === 3 && items.map((i) => Number(i.line_no)).join(',') === '1,2,3', JSON.stringify(items.map((i) => i.line_no)));
  assert('Part B: items carry description/quantity/unit/status', items.every((i) => i.description && i.quantity != null && i.unit));

  const standalone = (list.data || []).find((r) => r.pending_donation_id == null);
  assert('Part B: standalone rows expose no donation_items list', !standalone || !Array.isArray(standalone.donation_items) || standalone.donation_items.length === 0);

  // ── cleanup (throwaway only) ──
  await pool.query(`DELETE FROM warehouse_manager_flags WHERE id = $1`, [flag.rows[0].id]);
  await pool.query(`DELETE FROM pending_donation_items WHERE pending_donation_id = $1`, [pendingId]);
  await pool.query(`DELETE FROM pending_donations WHERE id = $1`, [pendingId]);
  await pool.query(`DELETE FROM products WHERE stock_keeping_unit IN ('ABCCHECK-SKU', 'ABCCHECK-FLAG')`);
  console.log('throwaway fixtures removed.');
  await pool.end();
};

run().catch((e) => { console.error('SCRIPT ERROR:', e.message); process.exit(1); });
