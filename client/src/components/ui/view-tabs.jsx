// ─────────────────────────────────────────────────────────────
// client/src/components/ui/view-tabs.jsx
//
// The row of saved views above a manager list: "All", "Low stock",
// "Shortfall"… each with how many rows it holds. Drawn the way Feed the
// Soil draws its Kits / Records tabs — an underline on the current one,
// muted text on the rest — so every manager screen switches views the
// same way.
//
//   tabs     — [{ id, label, count?, alert? }]. `alert` marks a view
//              that needs someone when it is not empty; its count turns
//              red so the problem is visible without opening the tab.
//   value    — the id of the current view
//   onChange — (id) => void
//   label    — what the views are of, for a screen reader ("Stock views")
//
// Arrow keys move between tabs, Home/End jump to the ends, the same as
// any other tab strip. Only the current tab is in the Tab order, so
// tabbing past the strip takes one press, not six.
//
// The underline is one bar that slides to the chosen tab, measured
// from the tab itself. Until it has been measured (and wherever there
// is no layout to measure) the tab draws its own underline instead.
// ─────────────────────────────────────────────────────────────
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export default function ViewTabs({ tabs, value, onChange, label = 'Views', className }) {
  const refs = useRef([]);
  const [bar, setBar] = useState(null);
  const activeIndex = tabs.findIndex((t) => t.id === value);

  // Runs after every render: a count changing width moves the tabs
  // after it. setBar only fires when the numbers really changed.
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[activeIndex];
      const next = el && el.offsetWidth ? { left: el.offsetLeft, width: el.offsetWidth } : null;
      setBar((prev) => (prev?.left === next?.left && prev?.width === next?.width ? prev : next));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  const onKeyDown = (e, index) => {
    const last = tabs.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft:  index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <div role="tablist" aria-label={label} className={cn('relative flex gap-1 overflow-x-auto border-b', className)}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        const hasCount = t.count !== undefined && t.count !== null;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm transition-colors',
              on ? 'font-medium' : 'text-muted-foreground hover:text-foreground',
              on && !bar && 'border-foreground',
            )}
          >
            {t.label}
            {/* A real space, so the tab reads "Low stock 3" rather
                than "Low stock3"; flex gap draws the visual one. */}
            {hasCount ? ' ' : null}
            {hasCount ? (
              <span
                className={cn(
                  'tabular-nums text-xs',
                  t.alert && t.count > 0 ? 'font-medium text-danger' : 'text-muted-foreground',
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
      {bar ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 h-0.5 bg-foreground transition-[left,width] duration-200 ease-out"
          style={{ left: bar.left, width: bar.width }}
        />
      ) : null}
    </div>
  );
}
