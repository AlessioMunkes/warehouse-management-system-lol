// ─────────────────────────────────────────────────────────────
// client/src/services/dispatchAPI.js
//
// Dispatch is the one staff task with no backend of its own yet, so
// this module is explicit about what is real and what is not.
//
// REAL, today:
//   The gate queue and the pallet check are built entirely from the
//   picking endpoints. A pallet that is staged for collection is a
//   picking slip with status 'complete', and its lines already carry
//   required_quantity, packed_quantity, status and flag_reason — which
//   is exactly the "slip says / actually there" comparison the gate
//   needs. No new query required.
//
// NEW, and needed:
//   Recording the collection itself: who collected, when, and the
//   driver's signature. URS 2.3 makes the signature the proof of
//   delivery, and nothing in the current server stores one against a
//   picking slip. recordCollection() below calls
//   POST /api/picking/:id/collect, which does not exist yet — the
//   server files for it are in this handoff under server/, and until
//   they are merged this call returns a 404 that the UI surfaces as
//   "could not save the collection".
//
// Deliberately NOT invented here: the 16:00 non-collection sweep
// (BR-14). That is a scheduled server job, not something a phone at
// the gate should be triggering. The dispatch screen only reports its
// result.
// ─────────────────────────────────────────────────────────────
import { apiPost } from './api';
import { fetchPickingSlips, fetchPickingSlip } from './pickingAPI';

// ── The gate queue ────────────────────────────────────────────
// Pallets staged for a given day. dispatchDate defaults to today,
// because that is the only day anybody collects on.
export const getGateQueue = async (dispatchDate) => {
  const date = dispatchDate || new Date().toISOString().slice(0, 10);
  const slips = await fetchPickingSlips({ dispatchDate: date, status: 'complete' });
  return slips || [];
};

// ── One pallet, with its lines ────────────────────────────────
export const getPallet = (slipId) => fetchPickingSlip(slipId);

// ── Record the collection (NEW ENDPOINT, see header) ──────────
// signatureData is a base64 PNG from the signature pad. The server's
// helmet CSP already allows img-src data:, which is what the existing
// delivery signatures rely on, so nothing needs changing there.
export const recordCollection = async (slipId, { signatureData, collectedBy, note }) => {
  const res = await apiPost(`/api/picking/${slipId}/collect`, {
    signatureData,
    collectedBy,          // the driver's or centre representative's name
    note: note || null,   // why a quantity differed, if it did
  });
  return res.data;
};

export default { getGateQueue, getPallet, recordCollection };
