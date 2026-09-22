// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/StatTile.jsx
//
// The number-with-an-icon card, lifted out of ManagerDashboardPage so
// the worker and admin dashboards use it too. There were about to be
// three near-copies of it, differing only in how they got the padding
// slightly wrong.
//
// `warn` turns the tile red ONLY when the value is above zero: a count
// of nothing is not a warning, and colouring an empty state red trains
// people to ignore the colour.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

// Counts up from 0 to `value` once, on mount — same eased
// requestAnimationFrame shape as the landing page's own CountUpStat
// (LandingPage.jsx), just without a scroll trigger: a dashboard tile
// is already on screen the instant it renders, nothing to wait to
// scroll into.
//
// Only the FIRST render animates. A tile that live-updates from a
// background refetch (every dashboard using this component polls)
// jumps straight to the new number instead of counting up again —
// replaying the animation on every poll tick would read as the page
// stuttering, not as motion.
//
// value ISN'T always a plain number — StockLedgerPage passes a
// pre-formatted string through fmtQty() ("1,234 kg"), and both that
// page and AdminActivityScreen pass the literal string "—" while a
// stat is still loading. Number() on either of those is NaN, so
// anything that isn't a clean numeric value renders exactly as given,
// same as this component did before the count-up existed — only a
// genuine number gets animated.
function useCountUp(value) {
  const isPlainNumber = typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  const target = isPlainNumber ? Number(value) : 0;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Lazy initializer so the very first paint is already correct —
  // 0 for the render that's about to animate up, `target` outright for
  // a reduced-motion visitor, or `value` itself unchanged when it isn't
  // a plain number — never a one-frame flash of the wrong content
  // before the effect below takes over.
  const [display, setDisplay] = useState(() => (
    !isPlainNumber ? value : (typeof window !== 'undefined' && reduced()) ? target : 0
  ));
  const animated = useRef(false);

  useEffect(() => {
    if (!isPlainNumber) { setDisplay(value); return undefined; }

    if (animated.current) {
      setDisplay(target);
      return undefined;
    }
    animated.current = true;

    if (target === 0 || reduced()) {
      setDisplay(target);
      return undefined;
    }

    const duration = 700;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, isPlainNumber, target]);

  return display;
}

export default function StatTile({ icon: Icon, label, value, to, warn }) {
  const alarming = warn && Number(value) > 0;
  const display = useCountUp(value);

  const content = (
    <Card className={`h-full transition-colors ${alarming ? 'border-[#ef3a40]' : 'hover:border-[#cfc7bd]'}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-full p-2 ${alarming ? 'bg-[#fff4f2] text-[#ef3a40]' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold leading-none">{display}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  return to ? <Link to={to} className="block h-full">{content}</Link> : content;
}
