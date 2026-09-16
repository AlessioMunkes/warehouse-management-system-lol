// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/shellContext.js
//
// Two small contexts the app shell provides.
//
// ShellContext lets ManagerLayout detect that it is already inside
// another ManagerLayout and render only its children. That is what
// makes it safe for ProtectedRoute to supply the shell at the route
// level while ten pages still call ManagerLayout themselves — the inner
// one becomes a passthrough instead of a second sidebar.
//
// ReducedMotionContext holds the "Less movement" accessibility setting.
// It used to be per-page useState in six different pages, so turning it
// on and navigating turned it off again. It now persists per device and
// seeds from the OS setting, which is what someone who needs it has
// usually already set.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react';

export const ShellContext = createContext(false);
export const useInsideShell = () => useContext(ShellContext);

export const ReducedMotionContext = createContext({
  reducedMotion: false,
  setReducedMotion: () => {},
});

export const useReducedMotion = () => useContext(ReducedMotionContext);

// The same key features/staff/hooks/useReducedMotion.js has always
// used. They were separate ('wms_reduced_movement' here), which meant
// the shell's toggle and StaffShell's toggle were two settings wearing
// the same label — turn it on in one, still animating in the other.
export const MOTION_KEY = 'stf_reduced_motion';

// prefers-reduced-motion is the honest default: someone who set it at
// the OS level has already said what they want.
// staff.css keys off <html data-stf-motion="reduced">, so plain CSS can
// honour the setting without every animated component reading a hook.
// Whoever changes the value keeps that attribute in step.
export const applyMotionAttribute = (reduced) => {
  try {
    const root = document.documentElement;
    if (reduced) root.setAttribute('data-stf-motion', 'reduced');
    else         root.removeAttribute('data-stf-motion');
  } catch { /* no document — nothing to mark */ }
};

export const readStoredMotion = () => {
  try {
    const stored = localStorage.getItem(MOTION_KEY);
    if (stored === 'true')  return true;
    if (stored === 'false') return false;
  } catch { /* private mode, blocked storage — fall through */ }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// ── The desktop sidebar's collapsed state ──────────────────────
//
// Same shape as the motion setting above: seeded once at mount,
// persisted per device, and harmless when storage is blocked.
//
// No context and no document attribute, unlike reduced motion.
// Nothing outside the shell reads this — the <aside> and its toggle
// are siblings inside ManagerLayoutShell — so state there plus this
// key is the whole feature. Reading it in a useState initialiser
// rather than an effect is what stops the rail flashing open on
// every page load for someone who keeps it closed.
export const SIDEBAR_KEY = 'stf_sidebar_collapsed';

export const readStoredSidebar = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  } catch {
    // Private mode, blocked storage — start expanded, which is the
    // state that shows someone everything they can reach.
    return false;
  }
};

export const writeStoredSidebar = (collapsed) => {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));
  } catch { /* nothing we can do */ }
};
