// ─────────────────────────────────────────────────────────────
// client/src/services/dispatchAPI.js
//
// Client wrapper around /api/dispatch. One function per route in
// dispatch.routes.js, nothing invented.
//
// WHAT THIS REPLACES, and why it matters
// The previous version of this file predated the dispatch backend.
// It built the gate queue out of picking slips and posted collections
// to POST /api/picking/:id/collect — a route that does not exist, so
// every collection at the gate 404'd. Its payload was wrong too: it
// sent { signatureData, collectedBy, note } where the server requires
// { driverName, signature }, so even with the URL corrected the
// request would have come back 400.
//
// The dispatch board is NOT the picking board. A pallet's gate state
// lives in dispatch_events, not in picking_slips.status, and only
// GET /api/dispatch joins the two. Reading picking slips directly
// meant a collected pallet simply vanished from the queue — its slip
// status becomes 'dispatched', not 'complete' — with no "collected"
// row to show for it, and the eligibility flags the server computes
// (wrong day, written off at 16:00, inactive centre) never reached
// the screen at all.
//
// LOADED QUANTITY IS THE POINT.
// Stock is deducted at the gate against loaded_quantity — what
// dispatch staff counted into the vehicle — not packed_quantity,
// which is what the packer believed they put on the pallet on
// Monday. The old client sent no line data at all, so every dispatch
// silently deducted the packed figure and the gate re-check counted
// for nothing. recordCollection takes a sparse `lines` array: only
// the lines that differ need to be sent, because the overwhelmingly
// common case is that the count matched.
// ─────────────────────────────────────────────────────────────
import { API_BASE, newIdempotencyKey } from './api';

const BASE_URL = `${API_BASE}/api/dispatch`;

// ── Shared request helper ─────────────────────────────────────
// Mirrors pickingAPI.js so the two modules cannot drift on the two
// things that are easy to forget on a new endpoint:
//
//   credentials: 'include' — auth is an httpOnly cookie. Without it
//     fetch sends nothing and every request 401s while the user is
//     visibly logged in.
//
//   API_BASE — in dev the client is on :5173 and the API on :5000
//     with no Vite proxy, so a bare '/api/dispatch' would hit the
//     Vite dev server and 404.
const request = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return handleResponse(res);
};

// Unwraps the { success, data, message } envelope every dispatch
// endpoint returns, and throws with `.status` attached so callers can
// tell a server refusal (403/409) from a dead connection.
async function handleResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Could not reach the dispatch service (status ${res.status}). Check your connection and try again.`
    );
  }

  const json = await res.json();
  if (!json.success) {
    const err = new Error(json.message || 'Request failed.');
    err.status  = res.status;
    err.payload = json;
    throw err;
  }
  return json.data;
}

// ── Today, in the warehouse's own timezone ────────────────────
// NOT toISOString().slice(0, 10). That formats in UTC, and Cape Town
// is UTC+2 — so between midnight and 02:00 SAST it returns YESTERDAY
// and the gate queue loads the wrong day's pallets. Building the
// string from the local date components gives the date the person
// holding the phone would write down.
export const todayISO = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── Idempotency key ───────────────────────────────────────────
// newIdempotencyKey moved to api.js — receiving needs the same thing
// and the server validates one shape, so there is one generator. It
// is re-exported here so anything importing it from this module
// keeps working.
//
// One key per collection ATTEMPT, reused on every retry of that
// attempt. See PalletCheck.jsx, which holds it in state for the life
// of the screen; a fresh key per tap would defeat the mechanism
// entirely.
export { newIdempotencyKey };

// ── GET /api/dispatch ─────────────────────────────────────────
// The gate board: every packed pallet for the day, plus everything
// already handled today, each row carrying its dispatch status.
//
// Rows are keyed on picking_slip_id, NOT id — the row is a join of a
// picking slip and its dispatch event, and `id` would be ambiguous.
//
// Loading the board may run the 16:00 non-collection sweep as a
// server-side side effect. That is deliberate on the server's part;
// nothing is needed here beyond calling it.
export const getBoard = ({ dispatchDate, cohort, status, scope } = {}) => {
  const params = new URLSearchParams();
  if (dispatchDate) params.set('dispatchDate', dispatchDate);
  if (cohort)       params.set('cohort', cohort);
  if (status)       params.set('status', status);
  if (scope)        params.set('scope', scope);

  const qs = params.toString();
  return request(qs ? `?${qs}` : '');
};

// The gate's board: every pallet still outstanding on ANY date, plus
// whatever was handled today.
//
// This used to default to todayISO(), which hid a pallet staged for
// Tuesday and never fetched — it is still physically in the building
// on Thursday, and the 16:00 sweep marks it not_collected precisely
// because it stays collectable as a late collection. A row nobody can
// see is a row nobody can release.
//
// "Today" is now resolved server-side from todayString(), not from the
// browser clock: a device with the wrong date or a non-SAST timezone
// would otherwise scope the board to the wrong day. Pass an explicit
// dispatchDate only when you actually want one exact day.
export const getGateQueue = (dispatchDate) =>
  dispatchDate
    ? getBoard({ dispatchDate })
    : getBoard({ scope: 'gate' });

// ── GET /api/dispatch/:id ─────────────────────────────────────
// One pallet as the gate sees it: the slip, its lines pre-filled with
// packed_quantity, and the `eligibility` object the server computed.
//
// Read those eligibility flags rather than re-deriving them here.
// They exist precisely so the screen and the collect endpoint cannot
// disagree about whether a pallet needs a manager's authorisation.
export const getGateView = (slipId) => request(`/${slipId}`);

// ── POST /api/dispatch/:id/collect ────────────────────────────
// lines is a SPARSE override map: [{ itemId, loadedQuantity,
// varianceReason }]. Any line not named keeps its packed quantity, so
// staff never have to retype twenty numbers to say "it all matched".
//
// signature is a base64 PNG data URL. It is not optional — BR-13
// makes it the proof of collection that replaces the paper register,
// and the server rejects a collection without one.
export const recordCollection = (
  slipId,
  { driverName, signature, vehicleReg, lines, idempotencyKey, overrideReason } = {}
) =>
  request(`/${slipId}/collect`, {
    method: 'POST',
    body: JSON.stringify({
      driverName,
      signature,
      vehicleReg:     vehicleReg || null,
      lines:          lines || [],
      idempotencyKey: idempotencyKey || null,
      overrideReason: overrideReason || null,
    }),
  });

// ── GET /api/dispatch/notes/:eventId ──────────────────────────
// The proof-of-collection document. Keyed on a dispatch_events id,
// which is a DIFFERENT id space to the picking_slip_id every other
// call in this file takes — pass row.dispatch_event_id, not
// row.picking_slip_id.
export const getDispatchNote = (eventId) => request(`/notes/${eventId}`);

// ── POST /api/dispatch/sweep (manager only) ───────────────────
// Forces the 16:00 non-collection write-off for a date. The board
// already sweeps opportunistically; this is for after a power cut or
// a deploy that landed across the cutoff.
export const runSweep = (dispatchDate) =>
  request('/sweep', {
    method: 'POST',
    body: JSON.stringify(dispatchDate ? { dispatchDate } : {}),
  });

// ── GET /api/dispatch/non-collections (BR-26) ─────────────────
// A centre that repeatedly fails to collect is a pattern, not an
// incident. Manager and finance only.
export const getNonCollectionHistory = ({ ecdId, from, to } = {}) => {
  const params = new URLSearchParams();
  if (ecdId) params.set('ecdId', ecdId);
  if (from)  params.set('from', from);
  if (to)    params.set('to', to);

  const qs = params.toString();
  return request(`/non-collections${qs ? `?${qs}` : ''}`);
};

export default {
  getBoard,
  getGateQueue,
  getGateView,
  recordCollection,
  getDispatchNote,
  runSweep,
  getNonCollectionHistory,
  todayISO,
  newIdempotencyKey,
};
