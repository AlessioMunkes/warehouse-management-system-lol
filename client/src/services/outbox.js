// ─────────────────────────────────────────────────────────────
// client/src/services/outbox.js
//
// Submissions that could not be sent, kept on the device until they
// can be.
//
// WHAT GOES IN HERE, AND WHAT DOES NOT
// Only submissions that carry an idempotency key. A queued request is
// a request that will be sent later, possibly twice if a flush is
// interrupted mid-flight, and the only thing that makes that safe is
// the server recognising the retry.
//
// Receiving, dispatch and donation intake keep the key in a column of
// their own (see the ON CONFLICT (idempotency_key) insert in
// delivery.repository.js). Everything else the floor submits (packing
// an item, logging a pallet packed, a decanting sheet, a benevolent
// request, a compost weigh-in) goes through offlinePost.js, and the
// server remembers those keys in one table
// (server/src/middleware/idempotency.middleware.js).
//
// NOT kept: anything whose answer depends on what other people did in
// the meantime. Claiming or releasing a pallet, and claiming a
// request, need a signal and say so.
//
// WHY IndexedDB AND NOT localStorage
// A receiving submission carries a signature as a PNG data URL. A few
// of those and a 5MB localStorage quota is gone, and the failure mode
// is a thrown QuotaExceededError in the middle of a save — exactly the
// moment you least want one. IndexedDB has no practical cap here and
// stores structured values without a JSON round trip.
//
// WHY NOT BACKGROUND SYNC
// The Background Sync API would flush without the app open, which
// sounds better and is worse here: a dispatch that records itself
// hours later with nobody watching is a stock movement nobody can
// account for. Everything in this queue flushes while the app is
// open, with a bar on screen saying what is waiting and what went.
//
// NOTHING IS SILENT. The count is on the screen whenever it is not
// zero, so "did that save?" always has an answer a worker can see.
//
// NOTHING IS A DEAD END EITHER. Every reason an item is still here has
// a way out, and the bar's list (OutboxPanel) shows which one applies:
//
//   no signal          waits, and goes on its own when the signal is back
//   signed out         a session that ran out while it waited. It is NOT
//                      given up on: it goes as soon as the same person
//                      signs in again. (It used to be retired for good,
//                      which lost the work with nothing anyone could do.)
//   somebody else's    recorded by another person on this phone. It is
//                      never sent under the wrong name; it waits for them
//   server busy        a rate limit, a timeout, a 5xx, or the same
//                      submission still being saved: tried again later
//   refused            the server said no for a reason a retry will not
//                      change. Kept, shown with the reason, and the
//                      worker can try it again or discard it
//   too old            over twelve hours. Not sent on its own; the worker
//                      can still send it deliberately, or discard it
// ─────────────────────────────────────────────────────────────

import { getActiveWarehouse, runWithWarehouse } from './warehouse';

const DB_NAME  = 'batches-outbox';
const STORE    = 'pending';
const VERSION  = 1;

// A queued item older than this is not sent. A day-old dispatch that
// suddenly posts itself moves stock against a date nobody expects and
// lands in a week that may already be reported on; it needs a person,
// not a retry. Kept and shown as stuck rather than deleted, because
// the numbers in it are the only record of work somebody did.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

let dbPromise = null;

// Who is signed in on this device. Set by useOutbox from the session.
// An item remembers who recorded it, and is only ever sent as them:
// the server ties a submission's key to its user, and a delivery
// recorded by one person must not arrive under another's name.
let owner = { id: null, name: null };
export const setOwner = (user) => {
  owner = user?.id != null
    ? { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || null }
    : { id: null, name: null };
};
const ownedByOther = (item, userId) => item.userId != null && userId != null && String(item.userId) !== String(userId);

const openDb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('No IndexedDB in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // A failed open must not poison every later call — a private window
  // or a browser with storage disabled would otherwise leave the app
  // permanently unable to queue anything without ever retrying.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
};

const withStore = async (mode, run) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = run(store); } catch (err) { reject(err); return; }
    // result may itself be a promise (a get/getAll request wrapper);
    // settle it before handing it back so callers await exactly once.
    tx.oncomplete = () => Promise.resolve(result).then(resolve, reject);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const req = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// ── Listeners, so the bar can show a live count ───────────────
const listeners = new Set();
export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const announce = async () => {
  // list() swallows its own storage failures and returns [], so there
  // is nothing here that can throw.
  const items = await list();
  for (const listener of listeners) {
    try { listener(items); } catch { /* not our problem */ }
  }
};

// ── The queue ─────────────────────────────────────────────────

export const list = async () => {
  try {
    return (await withStore('readonly', (store) => req(store.getAll()))) ?? [];
  } catch {
    // Storage unavailable is the same as an empty queue as far as
    // every caller is concerned. It must never throw into a render.
    return [];
  }
};

/**
 * @param {object} item
 * @param {string} item.endpoint  e.g. '/api/deliveries'
 * @param {object} item.body      must contain an idempotency key
 * @param {string} item.label     what a worker should see: 'Order 86'
 * @param {string} item.kind      'delivery' | 'collection' | 'packing' | 'decanting' | …
 * @param {object} [item.meta]   what a screen needs to show the work as done while it waits
 */
export const enqueue = async (item) => {
  // Multi-warehouse: remember where this was recorded. It is sent there
  // even if the worker has switched to another warehouse by the time
  // the signal comes back. Null with one database.
  const row = {
    warehouse: getActiveWarehouse(),
    userId: owner.id,
    userName: owner.name,
    ...item,
    savedAt: Date.now(),
    attempts: 0,
    error: null,
  };
  try {
    await withStore('readwrite', (store) => store.add(row));
  } catch {
    // Nothing can be stored on this device. The caller re-throws the
    // original network error, which is the truthful outcome.
    return false;
  }
  await announce();
  return true;
};

export const remove = async (id) => {
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch { /* already gone, or no storage */ }
  await announce();
};

// `permanent` is the difference between "the server is having a bad
// moment" and "this request is wrong and always will be". Only the
// second one is taken out of the retry rotation.
const patch = async (id, change) => {
  try {
    await withStore('readwrite', (store) => {
      const get = store.get(id);
      get.onsuccess = () => {
        const row = get.result;
        if (!row) return;
        store.put({ ...row, ...change(row) });
      };
    });
  } catch { /* no storage */ }
  await announce();
};

// `reason` is why it is still here: 'signin' | 'later' | 'refused' |
// 'stale'. Only 'refused' and 'stale' are taken out of the retry
// rotation (`permanent`), and both can be put back by hand.
const markFailed = (id, message, permanent, reason = permanent ? 'refused' : 'later') =>
  patch(id, (row) => ({
    attempts: (row.attempts ?? 0) + 1,
    error: message,
    permanent: Boolean(permanent),
    reason,
  }));

/**
 * Put a refused or too-old item back in the queue, on the worker's say
 * so. `forced` lets it past the twelve-hour rule once: the worker has
 * looked at it and decided it should still go.
 */
export const retry = (id) => patch(id, () => ({ permanent: false, error: null, reason: null, forced: true }));

// Why a failed send did not go, which decides what happens next.
const classify = (err) => {
  if (err?.isNetworkError) return 'offline';
  const status = err?.status ?? 0;
  // The session ran out while this waited. Signing in again fixes it.
  if (status === 401) return 'signin';
  // The server could not take it just now: a timeout, a rate limit, a
  // bad moment, or this very submission still being saved from an
  // earlier attempt (`retryable`). All worth another go.
  if (status === 408 || status === 425 || status === 429 || status >= 500 || err?.retryable) return 'later';
  // Any other 4xx is this request being wrong: a validation rule, a
  // pallet somebody else already collected. As wrong in thirty seconds.
  if (status >= 400) return 'refused';
  return 'later';
};

// One flush at a time. The timer, the "online" event and the Send now
// button can all fire together; two passes over the same queue would
// send the same item twice at once.
let flushing = null;

/**
 * The decision every caller would otherwise have to make identically:
 * is this worth keeping, and can it safely be retried?
 *
 * Returns true when the submission is now on the device and the
 * caller should report it as queued; false when it is not, and the
 * caller should re-throw the original error. It never throws: a
 * failure to queue is not a second problem to explain to a worker
 * who already has one.
 */
export const queueIfOffline = async (err, item) => {
  // A refusal is not a connectivity problem. Queueing a 400 would
  // retry it forever and hide the reason.
  if (!err?.isNetworkError) return false;
  // Without an idempotency key the server cannot recognise a retry,
  // and a queued send can be retried. See the note at the top.
  if (!item?.body?.idempotencyKey) return false;
  return await enqueue(item);
};

/**
 * Send everything that is waiting, oldest first.
 *
 * Order matters and is why this stops at the first network failure
 * rather than carrying on: two collections for the same pallet, or a
 * receiving and the dispatch that depends on it, have to reach the
 * server in the order the worker did them.
 *
 * @param {(endpoint: string, body: object) => Promise} post
 *        Injected rather than imported, so this module does not
 *        depend on api.js and api.js can depend on nothing.
 */
export const flush = (post) => {
  if (flushing) return flushing;
  flushing = runFlush(post).finally(() => { flushing = null; });
  return flushing;
};

const runFlush = async (post) => {
  const items = await list();
  const sent = [];

  for (const item of items) {
    // Refused, or too old: it stays in the list with its reason, and
    // is only sent again if the worker asks (retry()).
    //
    // Skipped rather than breaking the loop: a delivery the server
    // refused and a collection done twenty minutes later are separate
    // records, and blocking every later item behind one bad one would
    // mean a single stuck delivery quietly stops the whole day from
    // ever reaching the server.
    if (item.permanent) continue;

    // Recorded by someone else on this phone. It waits for them.
    if (ownedByOther(item, owner.id)) continue;

    if (!item.forced && Date.now() - item.savedAt > STALE_AFTER_MS) {
      await markFailed(item.id, 'Saved more than 12 hours ago, so it was not sent on its own.', true, 'stale');
      continue;
    }

    try {
      await runWithWarehouse(item.warehouse, () => post(item.endpoint, item.body));
      await remove(item.id);
      sent.push(item);
    } catch (err) {
      const why = classify(err);
      // Still no signal. Nothing behind this will go either, so stop.
      if (why === 'offline') break;

      if (why === 'signin') {
        // Not this item's fault and not a reason to give up on it.
        // Everything behind it would be turned away the same, so stop;
        // it all goes once the worker has signed in again.
        await markFailed(item.id, 'Sign in again to send this.', false, 'signin');
        break;
      }
      if (why === 'later') {
        await markFailed(item.id, err?.message || 'The server could not take this just now.', false, 'later');
        // A struggling server should not be hammered with the rest.
        break;
      }
      // Refused. It should not hold up what is behind it.
      await markFailed(item.id, err?.message || 'The server refused this.', true, 'refused');
    }
  }

  await announce();
  return sent;
};

// Exported for the tests and for a manager clearing something stuck.
export const STALE_AFTER = STALE_AFTER_MS;
