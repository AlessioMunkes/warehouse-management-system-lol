// ─────────────────────────────────────────────────────────────
// src/services/loading.js
//
// WHO IS WAITING ON THE SERVER, for the loading screen that covers the
// whole app (components/ui/loading-screen.jsx).
//
// Every request made through services/api.js is counted in here while
// it is in flight. But not every request is someone waiting: the bells
// and the dashboard ask the server on a timer, and a screen that
// flashed "Loading" each time one of those fired would be worse than
// no loading screen at all. So a request only counts when a person
// caused it:
//
//   it began just after they tapped, pressed Enter, or changed screen,
//   or it began while such a request was still going (a screen that
//   loads its list and then the details of the first row).
//
// A request on a timer starts with nobody having just done anything,
// and passes by unseen.
//
// Plain module state and a subscription, like services/connection.js:
// api.js is not a React component and has to be able to report in.
// ─────────────────────────────────────────────────────────────

// How long after an action a request still counts as caused by it.
const INTENT_MS = 2500;
// How long after one request ends the next still counts as part of it.
const CHAIN_MS = 600;

let waiting = 0;
let lastIntent = Date.now();        // opening the app is itself an action
let lastFinished = 0;
const listeners = new Set();

const emit = () => { for (const listener of listeners) listener(); };

/** Someone just did something that may need the server. */
export const markIntent = () => { lastIntent = Date.now(); };

/**
 * A request is starting. Returns the function to call when it ends,
 * however it ends. `quiet` is for a caller that shows its own progress
 * and wants no screen over it.
 */
export const beginLoad = ({ quiet = false } = {}) => {
  const now = Date.now();
  const caused = !quiet && (waiting > 0 || now - lastIntent < INTENT_MS || now - lastFinished < CHAIN_MS);
  if (!caused) return () => {};
  waiting += 1;
  emit();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    waiting = Math.max(0, waiting - 1);
    if (waiting === 0) lastFinished = Date.now();
    emit();
  };
};

/** Run `fn`, counted as a load while it runs. */
export const tracked = async (fn, options) => {
  const done = beginLoad(options);
  try {
    return await fn();
  } finally {
    done();
  }
};

export const isWaiting = () => waiting > 0;

export const subscribeLoading = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// A tap or Enter anywhere is an action. Typing is not: a search box
// that asks the server on every letter has its own list to show the
// wait in, and a screen over it would hide what is being typed.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', markIntent, { capture: true, passive: true });
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter') markIntent(); }, { capture: true, passive: true });
  window.addEventListener('popstate', markIntent);
}

// For the tests: back to nobody waiting and nothing just done.
export const resetLoading = ({ intent = false } = {}) => {
  waiting = 0;
  lastFinished = 0;
  lastIntent = intent ? Date.now() : 0;
  emit();
};
