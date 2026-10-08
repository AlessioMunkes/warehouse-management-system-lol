// ─────────────────────────────────────────────────────────────
// server/src/middleware/idempotency.middleware.js
//
// Makes a submission safe to send twice.
//
// A phone that lost signal sends what it kept once the signal returns,
// and may send it again if it never heard the answer. When the body
// carries an `idempotencyKey`, the first arrival does the work and its
// answer is stored (idempotency_keys, migration 040); a repeat is given
// that answer back with `duplicate: true` and nothing is done twice.
//
//   router.post('/', auth, requireRole(...), idempotent('decanting'), controller.record);
//
// After auth, so the key is tied to the person who sent it.
//
// NO KEY, NO CHANGE. A request without a key goes straight through, as
// it always did, so nothing that calls these routes has to send one.
//
// IT NEVER BLOCKS THE WORK. If the table cannot be read (a database not
// yet migrated, a dropped connection) the request carries on without
// the check: recording food twice is a nuisance, refusing to record it
// is worse.
//
// A FAILED ATTEMPT IS FORGOTTEN. Only a 2xx answer is stored. Anything
// else removes the key, so the same submission can be tried again once
// whatever was wrong is fixed.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const KEY = /^[A-Za-z0-9_-]{8,100}$/;
const KEEP_DAYS = 7;

const refuse = (res, status, message) => res.status(status).json({ success: false, message });

export const idempotent = (scope) => async (req, res, next) => {
  const key = req.body?.idempotencyKey;
  if (key === undefined || key === null || key === '') return next();
  if (typeof key !== 'string' || !KEY.test(key)) {
    return refuse(res, 400, 'The submission reference is not valid. Refresh and try again.');
  }
  const userId = req.user?.id ?? null;

  try {
    const claim = await pool.query(
      `INSERT INTO idempotency_keys (key, scope, user_id) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
      [key, scope, userId]
    );

    if (claim.rows.length === 0) {
      const { rows } = await pool.query(
        `SELECT scope, user_id, status_code, response FROM idempotency_keys WHERE key = $1`,
        [key]
      );
      const prior = rows[0];
      // Removed between the two statements: the first attempt failed
      // and cleared itself. Carry on as a first attempt, unrecorded.
      if (!prior) return next();
      if (prior.scope !== scope || Number(prior.user_id) !== Number(userId)) {
        return refuse(res, 409, 'This was already submitted as something else. Refresh and try again.');
      }
      if (prior.status_code === null) {
        return refuse(res, 409, 'This is already being saved. Check that it is recorded before trying again.');
      }
      const body = prior.response && typeof prior.response === 'object' && !Array.isArray(prior.response)
        ? { ...prior.response, duplicate: true }
        : prior.response;
      return res.status(prior.status_code).json(body);
    }
  } catch (err) {
    console.error(`[idempotency] ${scope}: not checked, carrying on:`, err.message);
    return next();
  }

  // Ours to do. Store the answer before it is sent, so a repeat that
  // arrives the instant after finds it.
  const send = res.json.bind(res);
  res.json = (body) => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    const settle = ok
      ? pool.query(`UPDATE idempotency_keys SET status_code = $2, response = $3::jsonb WHERE key = $1`,
        [key, res.statusCode, JSON.stringify(body ?? null)])
      : pool.query(`DELETE FROM idempotency_keys WHERE key = $1`, [key]);
    settle
      .catch((err) => console.error(`[idempotency] ${scope}: answer not stored:`, err.message))
      .finally(() => send(body));
    return res;
  };

  // Keys are only useful while a phone might still be holding the
  // submission (the outbox gives up after twelve hours). Cleared now
  // and then rather than on a schedule of their own.
  if (Math.random() < 0.02) {
    pool.query(`DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '${KEEP_DAYS} days'`).catch(() => {});
  }

  return next();
};

export default idempotent;
