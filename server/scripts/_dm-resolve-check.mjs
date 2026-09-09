// Read-only DB check + Issue 3 live check: standalone resolve WITHOUT a
// manager-typed sku (the payload the UI now sends) must fall back to the
// auto-generated FLAG-<flagId> sku.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const user = (await pool.query(`SELECT id, username, role FROM users WHERE role = 'admin' AND is_active = true ORDER BY id LIMIT 1;`)).rows[0];
const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const ts = Date.now();
const productRes = await pool.query(
  `INSERT INTO products (name, stock_keeping_unit, storage_type, is_active, is_decantable, code_type, default_unit, is_perishable)
   VALUES ($1, $2, 'dry', true, false, 'fixed', 'kg', false) RETURNING id;`,
  [`SKU_FALLBACK_CHECK_${ts}`, `SKU-FALLBACK-${ts}`]
);
const productId = productRes.rows[0].id;
const flagRes = await pool.query(
  `INSERT INTO warehouse_manager_flags (product_id, quantity_kg, reason, target_location, created_by, status)
   VALUES ($1, 1, 'Issue 3 sku-fallback verification.', 'Intake Holding Area', $2, 'pending_classification') RETURNING id;`,
  [productId, user.id]
);
const flagId = flagRes.rows[0].id;
console.log(`fixture: product #${productId}, flag #${flagId}`);

const res = await fetch(`http://localhost:5000/api/donations/pending/flags/${flagId}/resolve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: `wms_token=${token}` },
  // NOTE: no sku sent — matches the UI after the Issue 3 field removal.
  body: JSON.stringify({ accepted: true, name: `Issue3 No-SKU Item ${ts}`, storageType: 'dry', defaultUnit: 'kg', category: 'non_food' }),
});
console.log('STATUS', res.status);
console.log(JSON.stringify(await res.json(), null, 1));

const after = await pool.query(
  'SELECT id, name, stock_keeping_unit, storage_type, default_unit, is_active FROM products WHERE id = $1;',
  [productId]
);
console.log('product after:', JSON.stringify(after.rows, null, 1));

await pool.end();

