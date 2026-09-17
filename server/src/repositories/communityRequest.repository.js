// ─────────────────────────────────────────────────────────────
// server/src/repositories/communityRequest.repository.js
//
// All SQL for public.community_requests — the ADM-5.0 / BR-28 call-in
// log. The table was created on the live database ahead of this code
// (2026-08-19); these columns are the real, deployed shape, not
// anything this repo migrates into being.
//
// LOG ONLY. Nothing here touches stock_levels or stock_movements.
//
// NO AUDIT WRITES HERE — deliberately, and for the same reason the
// suppliers slice has none. audit_log.entity_id is `uuid NOT NULL`
// with no FK; community_requests.id is a plain integer sequence, so
// logAudit(client, { entityId: <int> }) fails with 22P02 (invalid
// uuid) exactly as it does today on users / products / purchase_orders.
// That mismatch is a known repo-wide gap; fixing it is out of scope
// for this feature. handled_by / resolved_at + outcome_note are the
// who/when/why trail this table actually keeps.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// One projection, reused by every read. LEFT JOIN so an unclaimed
// request (handled_by IS NULL) still comes back.
const SELECT_BASE = `
  SELECT cr.id, cr.requested_at, cr.caller_name, cr.caller_contact,
         cr.items_requested, cr.quantity_note, cr.outcome, cr.outcome_note,
         cr.handled_by, cr.resolved_at, cr.created_at,
         u.first_name AS handled_by_first_name,
         u.last_name  AS handled_by_last_name
    FROM public.community_requests cr
    LEFT JOIN public.users u ON u.id = cr.handled_by
`;

// ── One request by id ────────────────────────────────────────
const getRequestById = async (id, client = pool) => {
  const { rows } = await client.query(
    `${SELECT_BASE} WHERE cr.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

// ── List, newest first, with optional persistence-level filters ──
// outcome narrows to one enum value; search matches the item text or
// the caller name.
const listRequests = async ({ outcome = null, search = null } = {}, client = pool) => {
  const params = [];
  const where = [];

  if (outcome) {
    params.push(outcome);
    where.push(`cr.outcome = $${params.length}::request_outcome`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(cr.items_requested ILIKE $${params.length} OR cr.caller_name ILIKE $${params.length})`);
  }

  const { rows } = await client.query(
    `${SELECT_BASE}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY cr.requested_at DESC, cr.id DESC`,
    params
  );
  return rows;
};

// ── Create ───────────────────────────────────────────────────
// payload is already validated / normalised by the service:
// { callerName, callerContact, itemsRequested, quantityNote, requestedAt }.
// id (sequence), outcome ('pending'), requested_at (now()) and
// created_at (now()) all fall back to their column defaults —
// requestedAt is passed through COALESCE so a supplied value wins.
const createRequest = async (payload, client = pool) => {
  const {
    callerName = null,
    callerContact = null,
    itemsRequested,
    quantityNote = null,
    requestedAt = null,
  } = payload;

  const { rows } = await client.query(
    `INSERT INTO public.community_requests
       (caller_name, caller_contact, items_requested, quantity_note, requested_at)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
     RETURNING id`,
    [callerName, callerContact, itemsRequested, quantityNote, requestedAt]
  );
  return getRequestById(rows[0].id, client);
};

// ── Claim / assign — sets handled_by only ────────────────────
// The live seed data shows handled_by populated while outcome is
// still 'pending' and resolved_at is NULL: it is "who owns this
// request", set independently of resolution. Returns null when the
// row does not exist.
const claimRequest = async (id, handledBy, client = pool) => {
  const { rowCount } = await client.query(
    `UPDATE public.community_requests
        SET handled_by = $1
      WHERE id = $2`,
    [handledBy, id]
  );
  if (rowCount === 0) return null;
  return getRequestById(id, client);
};

// ── Resolve — sets outcome, outcome_note and resolved_at ──────
// Does NOT touch handled_by: a request may have been claimed earlier
// (handled_by already set) or resolved without ever being claimed
// (handled_by stays NULL). Returns null when the row does not exist.
const resolveRequest = async (id, { outcome, outcomeNote = null }, client = pool) => {
  const { rowCount } = await client.query(
    `UPDATE public.community_requests
        SET outcome = $1::request_outcome,
            outcome_note = $2,
            resolved_at = NOW()
      WHERE id = $3`,
    [outcome, outcomeNote, id]
  );
  if (rowCount === 0) return null;
  return getRequestById(id, client);
};

// ── Dashboard count ──────────────────────────────────────────
const countPending = async (client = pool) => {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM public.community_requests
      WHERE outcome = 'pending'`
  );
  return rows[0]?.count ?? 0;
};

export default {
  listRequests,
  getRequestById,
  createRequest,
  claimRequest,
  resolveRequest,
  countPending,
};
