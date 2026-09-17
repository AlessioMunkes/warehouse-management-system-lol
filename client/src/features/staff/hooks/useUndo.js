// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useUndo.js
//
// A short window in which one action can be taken back.
//
// WHY THIS AND NOT AN UNDO ON THE SAVE
// The obvious place to want undo is after the commit, and that is the
// one place it cannot go. A delivery, a collection and a decanting run
// are all irreversible server-side by design — decanting.service.js
// has no update path at all, because wastage cannot be un-recorded.
// The only way to offer undo on a commit would be to hold the
// submission back for ten seconds while the worker stands at the gate
// waiting, which trades a rare mistake for a delay on every single
// job. That is exactly the "slower than paper" failure the adoption
// risk in the URS is about.
//
// So this covers the action that actually costs something when it is
// tapped by accident: the bulk one. "Everything as ordered" fills and
// ticks nine lines in one press, and a worker who meant to tap the
// line below it has just signed off a delivery nobody counted. That is
// worth ten seconds of being able to say no.
//
// The restore closure captures the state as it was, so undo is a
// straight put-back rather than a computed inverse — there is nothing
// to get wrong when the list has changed underneath it.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';

export const UNDO_SECONDS = 10;

export default function useUndo(seconds = UNDO_SECONDS) {
  const [offer, setOffer] = useState(null);
  // A ref alongside the state so undo() can read the current offer
  // without running the restore inside a setState updater — React may
  // call an updater twice, and putting a side effect in one means
  // restoring twice under StrictMode.
  const offerRef = useRef(null);

  // The window closes on its own. A permanent undo strip is a
  // permanent invitation to wonder whether the thing happened.
  useEffect(() => {
    if (!offer) return undefined;
    const timer = setTimeout(() => {
      offerRef.current = null;
      setOffer(null);
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [offer, seconds]);

  const propose = useCallback((label, restore) => {
    const next = { label, restore, at: Date.now() };
    offerRef.current = next;
    setOffer(next);
  }, []);

  const undo = useCallback(() => {
    const current = offerRef.current;
    offerRef.current = null;
    setOffer(null);
    current?.restore?.();
  }, []);

  const dismiss = useCallback(() => {
    offerRef.current = null;
    setOffer(null);
  }, []);

  return { offer, propose, undo, dismiss };
}
