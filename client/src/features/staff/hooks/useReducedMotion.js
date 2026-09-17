// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useReducedMotion.js
//
// ACC-08. Two sources of truth, in this order:
//
//   1. The staff member's own choice, kept in localStorage so it
//      survives the app being closed. This exists because the
//      warehouse tablet is SHARED — its OS setting is not something
//      an individual volunteer can change, and asking them to dig
//      through iOS settings to stop a progress bar animating is not
//      a real option.
//   2. The OS/browser preference, for personal phones.
//
// The chosen value is written to <html data-stf-motion> so plain CSS
// can act on it (see staff.css) without every animated component
// having to read this hook.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';

const KEY = 'stf_reduced_motion';

const systemPrefers = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const readStored = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : raw === 'true';
  } catch {
    // Private mode, or storage disabled on a locked-down device.
    return null;
  }
};

export default function useReducedMotion() {
  // A stored choice wins; with none stored we follow the system.
  const [reduced, setReduced] = useState(() => readStored() ?? systemPrefers());

  useEffect(() => {
    const root = document.documentElement;
    if (reduced) root.setAttribute('data-stf-motion', 'reduced');
    else         root.removeAttribute('data-stf-motion');
  }, [reduced]);

  const toggle = useCallback(() => {
    setReduced((previous) => {
      const next = !previous;
      try { localStorage.setItem(KEY, String(next)); } catch { /* nothing we can do */ }
      return next;
    });
  }, []);

  return { reduced, toggle };
}
