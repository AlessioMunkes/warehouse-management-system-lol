// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/PurchaseOrderTimeline.jsx
//
// A vertical event timeline for the PO detail panel — order raised,
// each status change a person made (from the audit trail, with who and
// when), one entry per delivery actually recorded against it, then
// wherever the status sits today if receiving moved it there.
//
// Every entry is a real, dated event with real data behind it, not
// invented to fill out a shape.
// ─────────────────────────────────────────────────────────────
import { PackagePlus, Truck, Check, AlertTriangle, RotateCcw } from 'lucide-react';
import { formatShortDateTime as fmtDateTime } from '@/lib/dates';

const STATUS_ICON = {
  // A plain tick: the black circle round it is the row's, as on every
  // other step (a circled tick inside it read as a different kind of row).
  completed:          Check,
  returned:           RotateCcw,
  follow_up_required: AlertTriangle,
};

const STATUS_TONE = {
  completed:          'text-ink border-ink',
  returned:           'text-brand border-brand',
  follow_up_required: 'text-brand border-brand',
};

function TimelineRow({ icon: Icon, tone, title, meta, isLast }) {
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!isLast ? (
        <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border" aria-hidden="true" />
      ) : null}
      <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background ${tone}`}>
        <Icon className="size-4" />
      </span>
      <div className="pt-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </li>
  );
}

// Milliseconds, for putting events in the order they happened. An event
// with no time of its own sorts last.
const timeOf = (iso) => {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(ms) ? Infinity : ms;
};

export default function PurchaseOrderTimeline({ purchaseOrder: po }) {
  const events = [
    {
      at: -Infinity,   // always first, whatever the clock says
      icon: PackagePlus,
      tone: 'text-ink border-ink',
      title: 'Order raised',
      meta: `${po.createdByName || 'Unknown'} · ${fmtDateTime(po.createdAt)}`,
    },
    // The time shown is when the delivery was signed in. The delivery
    // date is a calendar day, and showing it as a time read "00:00" and
    // put every delivery ahead of an approval made that same morning.
    ...po.deliveries.map((d) => ({
      at: timeOf(d.recordedAt ?? d.deliveryDate),
      icon: Truck,
      tone: d.hasDiscrepancies ? 'text-brand border-brand' : 'text-ink border-ink',
      title: d.hasDiscrepancies ? 'Delivery received, with a discrepancy' : 'Delivery received',
      meta: `${d.receivedByName || 'Unknown'} · ${fmtDateTime(d.recordedAt ?? d.deliveryDate)}`,
    })),
  ];

  // Each status change a person made (approved, in transit, returned),
  // with who made it and when, from the audit trail.
  const changes = po.statusChanges ?? [];
  for (const c of changes) {
    events.push({
      at: timeOf(c.at),
      icon: STATUS_ICON[c.status] ?? Check,
      tone: STATUS_TONE[c.status] ?? 'text-ink border-ink',
      title: c.statusLabel,
      meta: [c.actorName || 'Unknown', fmtDateTime(c.at), c.reason].filter(Boolean).join(' · '),
    });
  }

  // Where the order stands now, unless a change above already says so
  // (receiving moves an order on without a person's change), and not for
  // a freshly raised order: "Pending approval" under "Order raised"
  // would say nothing new.
  const lastDeliveryAt = po.deliveries.map((d) => d.recordedAt ?? d.deliveryDate).filter(Boolean).sort().at(-1) ?? null;
  if (po.status !== 'pending' && changes.at(-1)?.status !== po.status) {
    events.push({
      at: timeOf(po.statusChangedAt ?? lastDeliveryAt),
      icon: STATUS_ICON[po.status] ?? Check,
      tone: STATUS_TONE[po.status] ?? 'text-ink border-ink',
      title: po.statusLabel,
      // When the status changed; for an order completed by its last delivery
      // with no change time of its own, when that delivery came in.
      meta: [fmtDateTime(po.statusChangedAt ?? lastDeliveryAt), po.statusReason].filter((v) => v && v !== '-').join(' · '),
    });
  }

  // In the order they happened. Array.sort is stable, so two events at
  // the same moment keep the order they were listed in.
  events.sort((a, b) => a.at - b.at);

  return (
    <ol className="mt-1">
      {events.map((event, i) => (
        <TimelineRow key={i} {...event} isLast={i === events.length - 1} />
      ))}
    </ol>
  );
}
