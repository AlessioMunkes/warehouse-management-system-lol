// ─────────────────────────────────────────────────────────────
// client/src/lib/recordCache.js
//
// Makes opening a record from a list feel immediate.
//
// The lists show a record's panel once its details have arrived, so a
// click used to wait a full trip to the server before anything moved.
// Most of that wait can be spent before the click: a pointer that comes
// to rest on a row is about to press it, and a press takes a tenth of a
// second to become a click. The record is asked for at those moments,
// and the click picks up the answer already on its way (or already
// here).
//
//   const records = useRecordCache((id) => api.getThing(id));
//   records.warm(id)                  — the pointer is on this row
//   await records.load(id)            — a row was clicked: reuse it
//   await records.load(id, { fresh: true })
//                                     — after a save: ask again
//
// An answer is reused for a few seconds only. This is not a store of
// records: a panel opened a minute later is read again, and anything
// that changes a record reads it fresh, so what is shown is never older
// than the moment the pointer arrived.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';

const REUSE_MS = 10_000;

export const createRecordCache = (fetcher, { reuseMs = REUSE_MS } = {}) => {
  const entries = new Map(); // id → { at, promise }

  const load = (id, { fresh = false } = {}) => {
    const hit = entries.get(id);
    if (!fresh && hit && Date.now() - hit.at < reuseMs) return hit.promise;

    const entry = { at: Date.now(), promise: Promise.resolve().then(() => fetcher(id)) };
    entries.set(id, entry);
    // A failure is not kept: the next click should try again.
    entry.promise.catch(() => { if (entries.get(id) === entry) entries.delete(id); });
    return entry.promise;
  };

  return {
    load,
    // The click reports its own failure; a guess that fails says nothing.
    warm: (id) => { load(id).catch(() => {}); },
    clear: () => entries.clear(),
  };
};

// One per mounted page, so nothing outlives the screen it belongs to.
export const useRecordCache = (fetcher) => useState(() => createRecordCache(fetcher))[0];

// Row attributes that call `warm` when the pointer rests on the row or
// presses it. Resting, not passing: a pointer swept down the list on
// its way somewhere else should not ask for fifteen records.
const REST_MS = 60;
let resting;
export const rowIntent = (warm) => ({
  onPointerEnter: () => { clearTimeout(resting); resting = setTimeout(warm, REST_MS); },
  onPointerLeave: () => clearTimeout(resting),
  onPointerDown: () => { clearTimeout(resting); warm(); },
});
