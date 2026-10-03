// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/useAttention.js
//
// The manager's "what needs me" counts (GET /api/dashboard/attention),
// for the sidebar and the dashboard's Needs attention list.
//
// Re-read when the person moves to another screen, at most every
// STALE_MS, and on a slow timer while they sit on one — so a count
// goes down soon after the problem is dealt with, without a request
// on every click. A failed read keeps the last good counts: a sidebar
// that loses its numbers on one dropped request reads as "all clear".
//
// `enabled` is false for anyone but a manager: the admin and worker
// menus have nothing these counts would sit beside.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAttention } from '../../services/dashboardAPI';

const STALE_MS   = 30 * 1000;
const REFRESH_MS = 2 * 60 * 1000;

export default function useAttention(enabled = true) {
  const { pathname } = useLocation();
  const [attention, setAttention] = useState(null);
  const lastRead = useRef(0);
  // Only unmounting drops a reply. A route change must not: the read it
  // started is still the newest one, and the next effect will not
  // start another inside STALE_MS.
  // Set true in the effect, not only at creation: StrictMode unmounts
  // and remounts once in development, and the ref survives that.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const read = () => {
      lastRead.current = Date.now();
      getAttention()
        .then((data) => { if (mounted.current) setAttention(data); })
        .catch(() => { /* keep the last good counts */ });
    };

    if (Date.now() - lastRead.current >= STALE_MS) read();
    const timer = setInterval(read, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, pathname]);

  return enabled ? attention : null;
}
