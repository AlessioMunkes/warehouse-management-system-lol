// ─────────────────────────────────────────────────────────────
// client/src/components/ui/notice.jsx
//
// "Saved." — the line a page shows after something worked. It arrives
// with a short fade and clears itself, so it confirms the action and
// then gets out of the way rather than sitting there until the next
// one. An error is not this: errors stay until dealt with (ErrorBanner).
//
//   message  — what happened; nothing renders without one
//   onClear  — called after `duration` ms; the page drops the message
//   duration — how long it stays (default 5 s); 0 keeps it
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Notice({ message, onClear, duration = 5000, className }) {
  // The latest onClear, without restarting the clock each time the
  // page re-renders and hands over a new function.
  const clear = useRef(onClear);
  useEffect(() => { clear.current = onClear; });

  useEffect(() => {
    if (!message || !duration) return undefined;
    const timer = setTimeout(() => clear.current?.(), duration);
    return () => clearTimeout(timer);
  }, [message, duration]);

  if (!message) return null;
  return (
    <p
      role="status"
      className={cn(
        'fx-fade-in flex items-start gap-2 rounded-lg border border-good/40 bg-good-soft px-4 py-3 text-sm text-good',
        className,
      )}
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
