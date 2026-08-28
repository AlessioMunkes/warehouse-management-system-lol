// Read-only DB check for the latest pending donations' flag/item state.
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const rows = await pool.query(
  'SELECT id, status, committed_donation_id FROM pending_donations ORDER BY id DESC LIMIT 3;'
);
console.log(JSON.stringify(rows.rows, null, 1));

const ids = rows.rows.map((r) => r.id);
const flags = await pool.query(
  'SELECT id, pending_donation_id, status FROM warehouse_manager_flags WHERE pending_donation_id = ANY($1::int[]) ORDER BY id;',
  [ids]
);
console.log(JSON.stringify(flags.rows, null, 1));

const items = await pool.query(
  'SELECT pending_donation_id, line_no, status, resolved_category FROM pending_donation_items WHERE pending_donation_id = ANY($1::int[]) ORDER BY pending_donation_id, line_no;',
  [ids]
);
console.log(JSON.stringify(items.rows, null, 1));

const dupes = await pool.query(
  `SELECT id, name, stock_keeping_unit, is_active FROM products WHERE name LIKE 'Flagged tab intake line%' ORDER BY id;`
);
console.log(JSON.stringify(dupes.rows, null, 1));

const flags149 = await pool.query(
  'SELECT id, product_id, pending_donation_id, status FROM warehouse_manager_flags WHERE id IN (149, 150);'
);
console.log(JSON.stringify(flags149.rows, null, 1));

await pool.end();
