// One-off live badge verification (read-only). Prints the raw math behind
// the D6/Q2 dashboard badge against the current fixture state.
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const { rows } = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM warehouse_manager_flags
      WHERE status = 'pending_classification' AND pending_donation_id IS NULL) AS legacy_flags,
    (SELECT COUNT(*) FROM warehouse_manager_flags
      WHERE status = 'pending_classification' AND pending_donation_id IS NOT NULL) AS intake_flags,
    (SELECT json_agg(json_build_object('id', id, 'status', status) ORDER BY id)
      FROM pending_donations
      WHERE status IN ('awaiting_resolution','committing','commit_failed','commit_incomplete')) AS attention_rows
`);
const { legacy_flags, intake_flags, attention_rows } = rows[0];
console.log('legacy/unlinked flags   :', legacy_flags);
console.log('intake-linked flags (NOT counted again):', intake_flags);
console.log('pending donations (attention statuses) :', attention_rows.length, JSON.stringify(attention_rows));
console.log('BADGE TOTAL =', Number(legacy_flags) + attention_rows.length);
await pool.end();
