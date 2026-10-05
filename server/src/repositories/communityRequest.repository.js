// ─────────────────────────────────────────────────────────────
// server/src/repositories/communityRequest.repository.js
//
// All SQL for public.community_requests (the ADM-5.0 / BR-28 call-in
// log) and its approved items, public.community_request_items
// (migration 036).
//
// THE FLOW
//   pending ("Awaiting approval")  logged by anyone
//     → approved                   a manager chose products and
//                                  quantities; stock is set aside
//        → fulfilled / partially_fulfilled
//                                  a worker confirmed what went out;
//                                  stock leaves the building
//     → declined                   at either stage; any reservation is
//                                  released
//   "referred" stays in the enum, unused.
//
// Stock is NOT written here. Reservations are derived from the lines
// (committedStock.sql.js) and stock leaves through adjustStock, called
// by the service in the same transaction as the confirmation.
//
// Every write below takes the caller's transaction client, and every
// UPDATE names the status it expects in its WHERE, so a lost race
// updates nothing and the caller reports it instead of overwriting.
//
// NO AUDIT WRITES HERE. handled_by / approved_by / resolved_at +
// outcome_note are the who/when/why trail this table keeps.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// items: the approved lines, newest information first for the page.
// A line with short_at set has stopped reserving stock.
export const SELECT_BASE = `
  SELECT cr.id, cr.requested_at, cr.caller_name, cr.caller_contact,
         cr.items_requested, cr.quantity_note, cr.outcome, cr.outcome_note,
         cr.handled_by, cr.resolved_at, cr.created_at,
         cr.approved_by, cr.approved_at, cr.assigned_to, cr.items_short_at,
         u.first_name  AS handled_by_first_name,
         u.last_name   AS handled_by_last_name,
         ua.first_name AS assigned_to_first_name,
         ua.last_name  AS assigned_to_last_name,
         ub.first_name AS approved_by_first_name,
         ub.last_name  AS approved_by_last_name,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id',               cri.id,
                    'productId',        cri.product_id,
                    'productName',      p.name,
                    'unit',             cri.unit,
                    'quantityApproved', cri.quantity_approved,
                    'quantityReleased', cri.quantity_released,
                    'shortAt',          cri.short_at
                  ) ORDER BY p.name, cri.id)
             FROM community_request_items cri
             JOIN products p ON p.id = cri.product_id
            WHERE cri.request_id = cr.id
         ), '[]'::json) AS items
    FROM public.community_requests cr
    LEFT JOIN public.users u  ON u.id  = cr.handled_by
    LEFT JOIN public.users ua ON ua.id = cr.assigned_to
    LEFT JOIN public.users ub ON ub.id = cr.approved_by
`;

const getRequestById = async (id, client = pool) => {
  const { rows } = await client.query(
    `${SELECT_BASE} WHERE cr.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

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

// ── Transitions ───────────────────────────────────────────────

// The row, locked for the rest of the transaction. Every transition
// starts here, which is what makes two people acting at once take
// turns: the second one reads the state the first one left.
export const LOCK_REQUEST_SQL = `
  SELECT id, outcome, handled_by, assigned_to, items_short_at
    FROM public.community_requests
   WHERE id = $1
     FOR UPDATE`;

const lockRequest = async (id, client) => {
  const { rows } = await client.query(LOCK_REQUEST_SQL, [id]);
  return rows[0] ?? null;
};

export const GET_ITEMS_SQL = `
  SELECT id, product_id, unit, quantity_approved, quantity_released, short_at
    FROM community_request_items
   WHERE request_id = $1
   ORDER BY product_id`;

const getItems = async (requestId, client) => {
  const { rows } = await client.query(GET_ITEMS_SQL, [requestId]);
  return rows;
};

export const APPROVE_SQL = `
  UPDATE public.community_requests
     SET outcome = 'approved'::request_outcome,
         approved_by = $2,
         approved_at = NOW(),
         items_short_at = NULL
   WHERE id = $1 AND outcome = 'pending'::request_outcome
   RETURNING id`;

const markApproved = async (id, userId, client) => {
  const { rowCount } = await client.query(APPROVE_SQL, [id, userId]);
  return rowCount > 0;
};

// Replaces the lines wholesale. Only ever called while nothing has
// been released (pending → approved, or an approved request being
// re-chosen), so there is no released quantity to lose.
export const DELETE_ITEMS_SQL = `
  DELETE FROM community_request_items WHERE request_id = $1`;
export const INSERT_ITEMS_SQL = `
  INSERT INTO community_request_items (request_id, product_id, unit, quantity_approved)
  SELECT $1, t.product_id, t.unit, t.quantity
    FROM unnest($2::int[], $3::text[], $4::numeric[]) AS t(product_id, unit, quantity)`;

const replaceItems = async (requestId, items, client) => {
  await client.query(DELETE_ITEMS_SQL, [requestId]);
  await client.query(INSERT_ITEMS_SQL, [
    requestId,
    items.map((i) => i.productId),
    items.map((i) => i.unit),
    items.map((i) => i.quantity),
  ]);
};

export const CLEAR_FLAG_SQL = `
  UPDATE public.community_requests SET items_short_at = NULL WHERE id = $1`;

const clearShortFlag = async (id, client) => {
  await client.query(CLEAR_FLAG_SQL, [id]);
};

export const DECLINE_SQL = `
  UPDATE public.community_requests
     SET outcome = 'declined'::request_outcome,
         outcome_note = $2,
         handled_by = COALESCE(handled_by, $3),
         resolved_at = NOW(),
         items_short_at = NULL
   WHERE id = $1 AND outcome IN ('pending'::request_outcome, 'approved'::request_outcome)
   RETURNING id`;

const markDeclined = async (id, { reason, userId }, client) => {
  const { rowCount } = await client.query(DECLINE_SQL, [id, reason, userId]);
  return rowCount > 0;
};

export const FIND_ASSIGNEE_SQL = `
  SELECT id FROM public.users
   WHERE id = $1 AND is_active = TRUE
     AND role IN ('warehouse_worker', 'manager', 'admin')`;

const findAssignableUser = async (userId, client) => {
  const { rows } = await client.query(FIND_ASSIGNEE_SQL, [userId]);
  return rows[0] ?? null;
};

export const ASSIGN_SQL = `
  UPDATE public.community_requests
     SET assigned_to = $2
   WHERE id = $1 AND outcome = 'approved'::request_outcome
   RETURNING id`;

const setAssignee = async (id, userId, client) => {
  const { rowCount } = await client.query(ASSIGN_SQL, [id, userId]);
  return rowCount > 0;
};

// One claimer only, and only an approved request that is not waiting
// for new items. The WHERE is the guard: of two people tapping Claim
// together, one row updates and the other gets nothing back.
export const CLAIM_SQL = `
  UPDATE public.community_requests
     SET handled_by = $2
   WHERE id = $1
     AND outcome = 'approved'::request_outcome
     AND items_short_at IS NULL
     AND handled_by IS NULL
   RETURNING id`;

const claimApproved = async (id, userId, client) => {
  const { rowCount } = await client.query(CLAIM_SQL, [id, userId]);
  return rowCount > 0;
};

export const CONFIRM_SQL = `
  UPDATE public.community_requests
     SET outcome = $2::request_outcome,
         handled_by = COALESCE(handled_by, $3),
         resolved_at = NOW()
   WHERE id = $1
     AND outcome = 'approved'::request_outcome
     AND items_short_at IS NULL
   RETURNING id`;

const markConfirmed = async (id, { outcome, userId }, client) => {
  const { rowCount } = await client.query(CONFIRM_SQL, [id, outcome, userId]);
  return rowCount > 0;
};

export const SET_RELEASED_SQL = `
  UPDATE community_request_items
     SET quantity_released = $2, updated_at = NOW()
   WHERE id = $1`;

const setReleased = async (lineId, quantity, client) => {
  await client.query(SET_RELEASED_SQL, [lineId, quantity]);
};

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
  lockRequest,
  getItems,
  markApproved,
  replaceItems,
  clearShortFlag,
  markDeclined,
  findAssignableUser,
  setAssignee,
  claimApproved,
  markConfirmed,
  setReleased,
  countPending,
};
