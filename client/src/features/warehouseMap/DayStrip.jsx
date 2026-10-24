// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/DayStrip.jsx
//
// Above the map: the warehouse's day at a glance (mapActivity.js
// todayCards). Collections and deliveries, what is being packed, who is
// on site, donations, and how many areas need someone. A card that has a
// place on the map opens it: Collections the dispatch gate, Deliveries
// the receiving gate, Packing now the staging area, Needs attention the
// toggle that lights the flagged areas.
//
// A day the warehouse is closed (the operating calendar) says so first.
// ─────────────────────────────────────────────────────────────
import { CalendarOff, HandHeart, PackageCheck, Truck, TriangleAlert, Users, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON = {
  dispatch: Truck, receiving: Warehouse, packing: PackageCheck, people: Users, donations: HandHeart, attention: TriangleAlert,
};
const TONE = {
  bad: 'border-danger/40 bg-danger-soft text-danger',
  warn: 'border-warn/40 bg-warn-soft text-warn',
  info: 'border-info/40 bg-info-soft text-info',
  violet: 'border-violet/40 bg-violet-soft text-violet',
  good: 'border-good/40 bg-good-soft text-good',
  neutral: 'border-line bg-surface-2 text-ink-soft',
};

const dayName = (day) => (day
  ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  : '');

// The cards are set out by the room the strip has (a container query),
// not the window, so they reflow when a panel opens beside the map.
export default function DayStrip({ today, cards, closure, onOpen }) {
  return (
    <section aria-labelledby="today-heading" className="@container space-y-2">
      <h2 id="today-heading" className="text-sm font-medium">
        Today <span className="font-normal text-muted-foreground">{dayName(today)}</span>
      </h2>
      {closure ? (
        <p className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
          <CalendarOff className="size-4 shrink-0" aria-hidden="true" />
          The warehouse is closed today: {closure.label}.
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-2 @xl:grid-cols-3 @5xl:grid-cols-6" aria-label="Today in the warehouse">
        {cards.map((c) => {
          const Icon = ICON[c.id] ?? Warehouse;
          const Tag = onOpen?.[c.id] ? 'button' : 'div';
          return (
            <li key={c.id}>
              <Tag
                {...(Tag === 'button' ? { type: 'button', onClick: onOpen[c.id] } : {})}
                className={cn(
                  'flex h-full w-full items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left',
                  Tag === 'button' && 'transition-colors hover:bg-muted/60',
                )}
              >
                <span className={cn('mt-0.5 rounded-lg border p-1.5', TONE[c.tone] ?? TONE.neutral)} aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{c.label}</span>
                  <span className="block text-sm font-semibold tabular-nums">{c.value}</span>
                  <span className="block text-xs text-muted-foreground">{c.detail}</span>
                </span>
              </Tag>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
