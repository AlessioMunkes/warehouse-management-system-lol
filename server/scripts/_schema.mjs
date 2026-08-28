import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const cols = await pool.query(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'pending_donations' ORDER BY ordinal_position;`
);
console.log('pending_donations columns:');
console.log(cols.rows.map((c) => `${c.column_name}: ${c.data_type}`).join('\n'));
await pool.end();