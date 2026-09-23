// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingFactor.repository.js
//
// The write side of reporting_factors. Split out from
// reporting.repository.js on purpose — that file's own header
// declares it read-only ("nothing here writes and nothing opens a
// transaction"), and a factor edit is exactly the kind of write that
// invariant exists to keep out.
//
// APPEND-ONLY, NOT UPDATE.
// reporting.repository.js's getFactor() reads the row with the latest
// effective_from that has already passed. Editing a factor in place
// would silently change a figure already quoted to a funder for a
// past period; inserting a new row with today's date as effective_from
// leaves every past report reproducible exactly as it was shown.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { logAudit } from './auditLog.repository.js';

// Closed set — not whatever key a request happens to send. New
// factor-backed metrics add their key here, matching factorKey in
// reportCatalog.js.
export const FACTOR_KEYS = ['kg_to_meals', 'kg_to_adults_served'];

const setFactor = async ({ factorKey, value, unit, sourceNote, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO reporting_factors
         (factor_key, value, unit, source_note, effective_from)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       RETURNING factor_key, value, unit, source_note, effective_from`,
      [factorKey, value, unit, sourceNote ?? null]
    );
    const factor = rows[0];

    await logAudit(client, {
      entityType: 'reporting_factor',
      entityId:   factorKey,
      action:     'set',
      actorId,
      after:      factor,
    });

    await client.query('COMMIT');
    return { ...factor, value: Number(factor.value) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Every effective_from a key has ever had, newest first — so the
// factor-editing UI can show the history rather than just the current
// value with no sense of when or how often it changes.
const listFactorHistory = async (factorKey) => {
  const { rows } = await pool.query(
    `SELECT factor_key, value, unit, source_note, effective_from
       FROM reporting_factors
      WHERE factor_key = $1
      ORDER BY effective_from DESC`,
    [factorKey]
  );
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
};

export default { FACTOR_KEYS, setFactor, listFactorHistory };
