// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/CountUp.jsx
//
// A number that counts up from its previous value to a new one on
// requestAnimationFrame, no library — same "hand-roll it, it's small"
// call this codebase already made for DonutStat.jsx and
// ReportChart.jsx's SVG charts.
//
// Honours the shell's "Less movement" setting (ReducedMotionContext,
// features/taskdashboard/components/shellContext.js) by jumping
// straight to the final value instead of animating — the same toggle
// TaskGrid and StockHealthBar already read, so this does not invent a
// second reduced-motion opinion.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../taskdashboard/components/shellContext';

const DURATION_MS = 900;

// Ease-out: fast at first, settling in — a number that visibly
// "arrives" reads as more deliberate than a linear ramp.
const easeOut = (t) => 1 - (1 - t) ** 3;

export default function CountUp({ value, formatter }) {
  const { reducedMotion } = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(null);

  // Reduced motion has nothing to animate, so it is handled directly in
  // the render path below rather than via a setState-in-effect — the
  // rAF loop is the one legitimate case (an external clock driving
  // state over time), so only that branch needs an effect at all.
  useEffect(() => {
    if (reducedMotion) return undefined;

    const target = Number(value) || 0;
    const from = fromRef.current;
    if (from === target) return undefined;

    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const eased = easeOut(progress);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, reducedMotion]);

  useEffect(() => { fromRef.current = Number(value) || 0; }, [value]);

  const rounded = Math.round(reducedMotion ? (Number(value) || 0) : display);
  return <>{formatter ? formatter(rounded) : rounded.toLocaleString('en-ZA')}</>;
}
