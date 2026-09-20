// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/components/PurchaseOrderTimeline.jsx
//
// A vertical event timeline for the PO detail panel — order raised,
// then one entry per delivery actually recorded against it, then
// wherever the status sits today.
//
// Not a full status-history log: purchase_orders only carries
// status_changed_at for the MOST RECENT transition, not a row per
// past change (see purchaseOrder.repository.js's own note on this).
// So the "today" entry is exactly that — where things stand now — not
// a claim that this is the Nth status change. Every other entry
// (raised, each delivery) is a real, dated event with real data
// behind it, not invented to fill out a shape.
// ─────────────────────────────────────────────────────────────
import { PackagePlus, Truck, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const STATUS_ICON = {
  completed:          CheckCircle2,
  returned:           RotateCcw,
  follow_up_required: AlertTriangle,
};

const STATUS_TONE = {
  completed:          'text-[#1a7d42] border-[#1a7d42]',
  returned:           'text-[#ef3a40] border-[#ef3a40]',
  follow_up_required: 'text-[#ef3a40] border-[#ef3a40]',
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

export default function PurchaseOrderTimeline({ purchaseOrder: po }) {
  const events = [
    {
      icon: PackagePlus,
      tone: 'text-[#2b3336] border-[#2b3336]',
      title: 'Order raised',
      meta: `${po.createdByName || 'Unknown'} · ${fmtDateTime(po.createdAt)}`,
    },
    ...po.deliveries.map((d) => ({
      icon: Truck,
      tone: d.hasDiscrepancies ? 'text-[#ef3a40] border-[#ef3a40]' : 'text-[#2b3336] border-[#2b3336]',
      title: d.hasDiscrepancies ? 'Delivery received — with a discrepancy' : 'Delivery received',
      meta: `${d.receivedByName || 'Unknown'} · ${fmtDateTime(d.deliveryDate)}`,
    })),
  ];

  // Only add a "today" entry when the status has actually moved past
  // pending — a freshly raised order's whole story is the one event
  // above, and repeating "Pending approval" under it would say
  // nothing new.
  if (po.status !== 'pending') {
    events.push({
      icon: STATUS_ICON[po.status] ?? CheckCircle2,
      tone: STATUS_TONE[po.status] ?? 'text-[#2b3336] border-[#2b3336]',
      title: po.statusLabel,
      meta: `${fmtDateTime(po.statusChangedAt)}${po.statusReason ? ` · ${po.statusReason}` : ''}`,
    });
  }

  return (
    <ol className="mt-1">
      {events.map((event, i) => (
        <TimelineRow key={i} {...event} isLast={i === events.length - 1} />
      ))}
    </ol>
  );
}
