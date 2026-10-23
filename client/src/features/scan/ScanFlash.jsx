// ─────────────────────────────────────────────────────────────
// client/src/features/scan/ScanFlash.jsx
//
// The green tick that says "that scan counted", in the middle of the
// screen for a moment. A person scanning is looking at the box and the
// camera, not at a line of text under a list, so the confirmation has
// to be big, central and gone quickly.
//
// `signal` goes up by one for every counted scan (useBarcodeReader's
// `scanned`); each new number shows the tick for SHOW_MS. Only counted
// scans: a product that is not on the list keeps its warning message
// and gets no tick, so green always means "it went in".
//
// It never takes a tap (pointer-events: none) and nothing in it moves,
// so the Reduce motion setting has nothing to turn off. The text for a
// screen reader is `label`.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const SHOW_MS = 900;

export default function ScanFlash({ signal, label }) {
  // The last signal whose tick has been taken away again.
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    if (!signal) return undefined;
    const timer = setTimeout(() => setHidden(signal), SHOW_MS);
    return () => clearTimeout(timer);
  }, [signal]);

  if (!signal || signal === hidden) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-1/3 z-[70] -translate-x-1/2 -translate-y-1/2"
      data-testid="scan-flash"
    >
      <span className="flex size-20 items-center justify-center rounded-full bg-good text-good-soft shadow-xl">
        <Check className="size-11" strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
