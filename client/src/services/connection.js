// ─────────────────────────────────────────────────────────────
// client/src/services/connection.js
//
// Whether this device can actually reach the server, and who to tell
// when that changes.
//
// WHY NOT JUST navigator.onLine
// It answers a different question. `navigator.onLine` is true the
// moment a network interface exists — a warehouse wifi access point
// with no uplink, a phone showing one bar that cannot complete a
// request, a captive portal. All of those report "online" while every
// call fails. Believing it is how an app tells a worker everything is
// fine while nothing is saving.
//
// So the browser's events are used as a HINT (they are instant and
// they are right about the obvious case, aeroplane mode) and real
// request outcomes are used as the TRUTH. api.js calls reportReach /
// reportUnreachable on every call it makes, so the state is a fact
// about the last thing this app actually tried, not a guess.
//
// One consecutive failure is enough to go offline — a worker needs to
// know immediately. Coming back needs a real success, not an event,
// because `online` firing says nothing about whether the server is
// there.
//
// Plain module state and a Set of listeners rather than a React
// context: api.js is not a component and cannot read one, and this
// has to be writable from the service layer.
// ─────────────────────────────────────────────────────────────

let reachable = true;
const listeners = new Set();

const announce = () => {
  for (const listener of listeners) {
    // One listener throwing must not stop the others hearing about
    // it: this is how the offline bar learns to appear.
    try { listener(reachable); } catch { /* not our problem */ }
  }
};

const set = (next) => {
  if (reachable === next) return;
  reachable = next;
  announce();
};

export const isReachable = () => reachable;

// Called by api.js on every completed request — including a 400 or a
// 500. A server that refuses us is still a server we reached, and
// telling a worker they have no signal because a validation rule
// fired would be a lie that sends them looking for a wifi problem.
export const reportReach = () => set(true);

// Called by api.js when fetch() itself rejects: the request never
// completed. See networkError() there.
export const reportUnreachable = () => set(false);

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// The browser's own events, as the hint described above. Guarded for
// the test environment and for any future server-side render.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // Losing the interface is conclusive: nothing can be reached.
  window.addEventListener('offline', () => set(false));
  // Regaining one is not. The flush that follows will call
  // reportReach if the server is genuinely back; until then the bar
  // keeps saying there is no signal, which is still true.
  window.addEventListener('online', () => announce());
}
