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

export const clearDraft = (key) => {
  if (!key) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch { /* see writeDraft */ }
};

export default { readDraft, writeDraft, clearDraft };
