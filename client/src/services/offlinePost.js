// ─────────────────────────────────────────────────────────────
// client/src/services/offlinePost.js
//
// A POST that survives no signal.
//
// Sent straight away when the server can be reached. When it cannot,
// the submission is kept on the device (outbox.js) and the caller gets
// { queued: true, label } back instead of an answer, so the screen can
// say "saved on this phone" rather than pretend it is on the system.
// The offline bar shows it waiting and sends it once back in range.
//
// Every submission is given a key the server remembers
// (server/src/middleware/idempotency.middleware.js), which is what
// makes it safe for the outbox to send it again if the first send was
// cut off before the answer arrived.
//
// Only for work that still makes sense minutes later, done by the
// person holding the phone: a packed item, a decanting sheet, a logged
// request. Not for anything that depends on what others did meanwhile
// (claiming a pallet) — that needs a signal and says so.
// ─────────────────────────────────────────────────────────────
import { apiPost, newIdempotencyKey } from './api';
import { queueIfOffline } from './outbox';

/**
 * @param {string} endpoint  '/api/decanting'
 * @param {object} payload
 * @param {object} what
 * @param {string} what.kind   a word for the kind of work: 'packing'
 * @param {string} what.label  what a worker should see: 'Pallet 12'
 * @param {object} [what.meta] anything a screen needs to show the work
 *                             as done while it waits (see pickingAPI)
 * @returns the server's envelope, or { queued: true, label }
 */
export const postOrQueue = async (endpoint, payload, { kind, label, meta } = {}) => {
  const body = { ...payload, idempotencyKey: payload?.idempotencyKey || newIdempotencyKey() };
  try {
    return await apiPost(endpoint, body);
  } catch (err) {
    if (await queueIfOffline(err, { endpoint, body, kind, label, meta })) {
      return { queued: true, label };
    }
    throw err;
  }
};

export default postOrQueue;
