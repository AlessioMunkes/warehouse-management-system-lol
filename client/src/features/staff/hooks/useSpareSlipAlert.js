// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useSpareSlipAlert.js
//
// Tells StaffShell when there's spare work on the floor, so the
// Packing tab can carry a badge and a worker on another screen gets a
// heads-up instead of having to keep checking. There's no websocket
// in this app, so polling is the honest option here, not a stand-in
// for one. A phone alert (push) also triggers a check straight away.
//
// The FIRST fetch is a baseline, never an announcement — a worker
// opening the app to five already-spare slips did not just get five
// new pallets, they opened the app. Only a slip that shows up on a
// LATER poll, one that wasn't there the poll before, counts as new.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { fetchPickingSlips } from '../../../services/pickingAPI';
import { todayISO, isSpareSlip } from '../../packing/spareSlips';
import { NOTIFICATIONS_CHANGED } from '../../notifications/notificationMatrix';

const POLL_MS = 45000;
const ANNOUNCE_MS = 10000;

export default function useSpareSlipAlert(active = true) {
  const [spareCount, setSpareCount] = useState(0);
  const [justArrived, setJustArrived] = useState([]);
  // null until the first poll lands — that's what makes it a baseline
  // rather than an announcement.
  const knownIds = useRef(null);
  const dismissTimer = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;

    const poll = () => {
      fetchPickingSlips({ dispatchDate: todayISO() })
        .then((rows) => {
          if (cancelled) return;
          const spare = (rows || []).filter(isSpareSlip);
          setSpareCount(spare.length);

          if (knownIds.current) {
            const arrived = spare.filter((s) => !knownIds.current.has(s.id));
            if (arrived.length > 0) {
              setJustArrived(arrived);
              clearTimeout(dismissTimer.current);
              dismissTimer.current = setTimeout(() => setJustArrived([]), ANNOUNCE_MS);
            }
          }
          knownIds.current = new Set(spare.map((s) => s.id));
        })
        // A missed poll just tries again next interval — nothing on
        // screen depends on any one fetch succeeding.
        .catch(() => {});
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    // A phone alert about new slips: check now, so the Packing dot is
    // already there when the worker looks.
    window.addEventListener(NOTIFICATIONS_CHANGED, poll);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED, poll);
      clearTimeout(dismissTimer.current);
    };
  }, [active]);

  const dismiss = () => {
    clearTimeout(dismissTimer.current);
    setJustArrived([]);
  };

  return { spareCount, justArrived, dismiss };
}
