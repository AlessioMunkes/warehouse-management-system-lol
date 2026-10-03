// ─────────────────────────────────────────────────────────────
// server/src/features/calendar/calendar.repository.js
//
// operating_closures (migration 034): the days the warehouse is shut.
// Dates go in and come out as 'YYYY-MM-DD' strings — ::text on the way
// out, so node-postgres never turns a DATE into a midnight-UTC Date.
// ─────────────────────────────────────────────────────────────
import pool from '../../config/db.js';

const COLUMNS = `id, closed_on::text AS date, kind, label, created_by AS "createdBy", created_at AS "createdAt"`;

const list = async ({ from = null, to = null } = {}) => {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}
       FROM operating_closures
      WHERE ($1::date IS NULL OR closed_on >= $1::date)
        AND ($2::date IS NULL OR closed_on <= $2::date)
      ORDER BY closed_on`,
    [from, to],
  );
  return rows;
};

const findByDate = async (date) => {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM operating_closures WHERE closed_on = $1::date`,
    [date],
  );
  return rows[0] ?? null;
};

/** Inserts each { date, kind, label }; a date already closed is left alone. */
const insertMany = async (days, userId) => {
  const created = [];
  for (const day of days) {
    const { rows } = await pool.query(
      `INSERT INTO operating_closures (closed_on, kind, label, created_by)
       VALUES ($1::date, $2, $3, $4)
       ON CONFLICT (closed_on) DO NOTHING
       RETURNING ${COLUMNS}`,
      [day.date, day.kind, day.label, userId ?? null],
    );
    if (rows[0]) created.push(rows[0]);
  }
  return created;
};

const remove = async (id) => {
  const { rows } = await pool.query(
    `DELETE FROM operating_closures WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
};

export default { list, findByDate, insertMany, remove };
