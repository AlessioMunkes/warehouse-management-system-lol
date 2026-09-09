// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useCoachmark.js
//
// A first-time-only hint, shown once per browser and never again —
// not a per-account preference synced anywhere, the same "storage
// first, nothing fancier" approach useReducedMotion.js takes, for the
// same reason: this is a shared warehouse tablet, not a personal
// login session worth a server-side seen/unseen flag.
//
// The initial read happens in useState's lazy initializer rather
// than an effect, so there is no extra render between "hidden" and
// "shown" — a returning worker never sees so much as a one-frame
// flash of a hint meant for someone else's first day.
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';

const keyFor = (id) => `stf_coachmark_seen:${id}`;

export default function useCoachmark(id) {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(keyFor(id)) !== 'true';
    } catch {
      // Private mode, or storage disabled — don't nag every load.
      return false;
    }
  });

  const dismiss = useCallback(() => {
    setShow(false);
    try { localStorage.setItem(keyFor(id), 'true'); } catch { /* nothing we can do */ }
  }, [id]);

  return { show, dismiss };
}
