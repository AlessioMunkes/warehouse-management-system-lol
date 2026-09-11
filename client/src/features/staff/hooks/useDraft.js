// ───────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useDraft.js
//
// Keeps an in-progress job on the device so a tablet that sleeps, a
// dropped connection or a stray back-swipe does not throw away a
// half-counted delivery.
//
// Scoped by key — one draft per purchase order, one per pallet — so
// two jobs never overwrite each other and finishing one does not
// clear another.
//
// localStorage, not IndexedDB: this is a few kilobytes of form state
// belonging to one worker on one device, it must survive a reload
// rather than a reinstall, and every read and write is wrapped because
// a private window throws on access rather than returning null.
//
// This is NOT the offline write queue. Nothing here is ever sent to
// the server on its own; it only refills the form. The queue is a
// bigger piece of work and is still open.
// ───────────────────────────────────────────────────────────

const PREFIX = 'stf_draft_';

// A draft older than this is stale enough that refilling a form with
// it would be a surprise rather than a convenience. A shift is eight
// hours; a day covers someone coming back after lunch and not someone
// coming back next week to last week's delivery.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const readDraft = (key) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
};

export const writeDraft = (key, data) => {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // A full or blocked store is not a reason to interrupt someone
    // counting stock. The draft is a convenience; the form still works.
  }
};

// Every draft on this device, newest first, with enough on each to
// name it on a screen.
//
// Reads the whole of localStorage rather than keeping an index: an
// index is a second thing that can disagree with the first, and a
// warehouse phone holds a handful of keys, not thousands. Expired
// drafts are dropped on the way past, which is the same rule readDraft
// applies — there is no point offering to resume last week's delivery.
export const listDrafts = () => {
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const storageKey = localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(PREFIX)) continue;

      const key = storageKey.slice(PREFIX.length);
      let parsed;
      try { parsed = JSON.parse(localStorage.getItem(storageKey)); } catch { continue; }
      if (!parsed?.savedAt) continue;
      if (Date.now() - parsed.savedAt > MAX_AGE_MS) continue;

      found.push({ key, savedAt: parsed.savedAt, data: parsed.data ?? null });
    }
  } catch {
    // Private window, or storage blocked. No drafts is the right
    // answer, and it must never throw into a render.
    return [];
  }
  return found.sort((a, b) => b.savedAt - a.savedAt);
};

export const clearDraft = (key) => {
  if (!key) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch { /* see writeDraft */ }
};

export default { readDraft, writeDraft, clearDraft, listDrafts };
