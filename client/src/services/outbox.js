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
// the server recognising the retry. Receiving and dispatch both send
// one (see newIdempotencyKey and the ON CONFLICT (idempotency_key)
// insert in delivery.repository.js / dispatch). Decanting does NOT,
// and decanting cannot be un-recorded, so it is deliberately left out
// — it fails honestly instead, and the worker's numbers stay on the
// screen.
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
// ─────────────────────────────────────────────────────────────

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
 * @param {string} item.kind      'delivery' | 'collection'
 */
export const enqueue = async (item) => {
  const row = { ...item, savedAt: Date.now(), attempts: 0, error: null };
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
const markFailed = async (id, message, permanent) => {
  try {
    await withStore('readwrite', (store) => {
      const get = store.get(id);
      get.onsuccess = () => {
        const row = get.result;
        if (!row) return;
        store.put({
          ...row,
          attempts: (row.attempts ?? 0) + 1,
          error: message,
          permanent: Boolean(permanent),
        });
      };
    });
  } catch { /* no storage */ }
  await announce();
};

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
export const flush = async (post) => {
  const items = await list();
  const sent = [];

  for (const item of items) {
    // Already refused for a reason a retry cannot fix. It stays in
    // the list so a person can see it; it is not sent again.
    //
    // Skipped rather than breaking the loop: a delivery the server
    // refused and a collection done twenty minutes later are separate
    // records, and blocking every later item behind one bad one would
    // mean a single stuck delivery quietly stops the whole day from
    // ever reaching the server.
    if (item.permanent) continue;

    if (Date.now() - item.savedAt > STALE_AFTER_MS) {
      if (!item.error) await markFailed(item.id, 'Too old to send on its own.', true);
      continue;
    }

    try {
      await post(item.endpoint, item.body);
      await remove(item.id);
      sent.push(item);
    } catch (err) {
      // Still no signal. Nothing behind this will go either, so stop.
      if (err?.isNetworkError) break;

      const status = err?.status ?? 0;
      // 4xx is this request being wrong \u2014 a validation rule, an
      // expired session, a pallet somebody else already collected. It
      // will be just as wrong in thirty seconds. 5xx is the server
      // having a bad moment and is worth another go.
      const permanent = status >= 400 && status < 500;
      await markFailed(item.id, err?.message || 'The server refused this.', permanent);

      // A struggling server should not be hammered with the rest of
      // the queue; a permanently refused item should not hold it up.
      if (!permanent) break;
    }
  }

  await announce();
  return sent;
};

// Exported for the tests and for a manager clearing something stuck.
export const STALE_AFTER = STALE_AFTER_MS;
