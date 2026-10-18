// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingAdhoc.repository.js
//
// The two reporting reads whose SQL is not written here.
//
// runQuery runs what features/reporting/customQuery.js builds from a
// validated custom report: its tables and columns come from a fixed
// list there, and every value is a parameter.
//
// findIdByName looks up the record a chart bar is named after. `table`
// comes from drillDown.js's fixed list, never from a request.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

export const runQuery = (sql, params) => pool.query(sql, params);

export const findIdByName = async (table, name) => {
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE name = $1 ORDER BY id LIMIT 1`, [name]);
  return rows[0]?.id ?? null;
};

export default { runQuery, findIdByName };
