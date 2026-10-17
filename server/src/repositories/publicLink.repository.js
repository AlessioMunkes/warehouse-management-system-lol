// ─────────────────────────────────────────────────────────────
// server/src/repositories/publicLink.repository.js
//
// Does this warehouse's database hold the secret in a public link?
// middleware/publicWarehouse.middleware.js runs one of these in every
// warehouse to find where a pallet QR code, invite or Section 18A form
// belongs. Each answers true or false; hashing the token is the
// caller's job.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const exists = async (sql, params) => (await pool.query(sql, params)).rows.length > 0;

export const slipShortCodeExists = (code) =>
  exists('SELECT 1 FROM picking_slips WHERE RIGHT(public_token::text, 6) = LOWER($1) LIMIT 1', [code]);

export const slipTokenExists = (token) =>
  exists('SELECT 1 FROM picking_slips WHERE public_token = $1::uuid', [token]);

export const inviteExists = (tokenHash) =>
  exists('SELECT 1 FROM user_invites WHERE token_hash = $1', [tokenHash]);

export const section18aFormExists = (tokenHash) =>
  exists('SELECT 1 FROM donations WHERE section_18a_form_token_hash = $1', [tokenHash]);

export default { slipShortCodeExists, slipTokenExists, inviteExists, section18aFormExists };
