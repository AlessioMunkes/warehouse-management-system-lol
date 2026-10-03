// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/components/NeedsAttention.jsx
//
// The top of the manager's dashboard: everything that needs someone,
// one line each, worst first, each line opening the screen it is about
// on the tab that holds exactly those rows. The widgets below it are
// for reading the warehouse; this is for acting on it.
//
// Every count comes from GET /api/dashboard/attention, and every count
// is the size of the tab it links to — the Inventory, Picking Slips and
// Purchase Orders tabs all read ?status=. A line whose count is zero is
// not shown; nothing at all reads as "nothing needs you".
//
// The admin's dashboard passes its own lines as `items` instead
// (adminAttention.js); `attention` is the manager's counts.
//
// The header folds the list away. Folded, it still says how many
// things are waiting, so folding it never hides that there is work.
// Remembered per browser, per `storageKey`.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, CircleCheck, CircleX, ClipboardList, Hourglass, PhoneCall,
  ShoppingCart, TrendingDown, TriangleAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STAFF } from '../../../routes/paths';

const INVENTORY = '/noc/inventory';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Worst first: things already gone wrong, then things about to, then
// the queue that is simply waiting for someone.
const lines = (a) => [
  { key: 'shortfall', tone: 'bad', icon: CircleX, count: a.inventory.shortfall,
    text: (n) => `${plural(n, 'product is', 'products are')} promised beyond what is on hand`,
    to: `${INVENTORY}?status=shortfall` },
  { key: 'notCollected', tone: 'bad', icon: TriangleAlert, count: a.pickingSlips.notCollected,
    text: (n) => `${plural(n, 'pallet was', 'pallets were')} not collected this week`,
    to: `${STAFF.pickingSlips}?status=notcollected` },
  { key: 'followUp', tone: 'bad', icon: TriangleAlert, count: a.purchaseOrders.followUp,
    text: (n) => `${plural(n, 'purchase order needs', 'purchase orders need')} following up with the supplier`,
    to: `${STAFF.purchaseOrders}?status=follow_up_required` },
  { key: 'expiring', tone: 'warn', icon: Hourglass, count: a.inventory.expiring,
    text: (n) => `${plural(n, 'product has', 'products have')} a delivery expiring within 30 days`,
    to: `${INVENTORY}?status=expiring` },
  { key: 'awaitingApproval', tone: 'warn', icon: ShoppingCart, count: a.purchaseOrders.awaitingApproval,
    text: (n) => `${plural(n, 'purchase order is', 'purchase orders are')} waiting for approval`,
    to: `${STAFF.purchaseOrders}?status=pending` },
  { key: 'lowStock', tone: 'warn', icon: TrendingDown, count: a.inventory.lowStock,
    text: (n) => `${plural(n, 'product is', 'products are')} at or below the reorder level`,
    to: `${INVENTORY}?status=lowstock` },
  { key: 'requestsNeedItems', tone: 'warn', icon: PhoneCall, count: a.communityRequests.needsItems,
    text: (n) => `${plural(n, 'benevolent request needs', 'benevolent requests need')} new items`,
    to: `${STAFF.communityRequests}?status=needs-items` },
  { key: 'pendingRequests', tone: 'warn', icon: PhoneCall, count: a.communityRequests.pending,
    text: (n) => `${plural(n, 'benevolent request is', 'benevolent requests are')} waiting for approval`,
    to: `${STAFF.communityRequests}?status=pending` },
  { key: 'unassigned', tone: 'info', icon: ClipboardList, count: a.pickingSlips.unassigned,
    text: (n) => `${plural(n, 'slip', 'slips')} this week nobody has claimed yet`,
    to: `${STAFF.pickingSlips}?status=unassigned` },
  { key: 'unclaimedRequests', tone: 'info', icon: PhoneCall, count: a.communityRequests.unclaimed,
    text: (n) => `${plural(n, 'approved request has', 'approved requests have')} not been claimed yet`,
    to: `${STAFF.communityRequests}?status=approved` },
];

const TONE = {
  bad:  'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
};

const readCollapsed = (key) => {
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
};
const writeCollapsed = (key, value) => {
  try { window.localStorage.setItem(key, value ? '1' : '0'); } catch { /* not kept; still works this visit */ }
};

export default function NeedsAttention({ attention, items, storageKey = 'wms.dashboard.attention.collapsed' }) {
  // `items` (null while loading) or the manager's `attention` counts.
  const source = items !== undefined ? items : attention ? lines(attention) : null;
  const loading = source === null;
  const due = loading ? [] : source.filter((l) => l.count > 0);

  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));
  const toggle = () => setCollapsed((c) => { writeCollapsed(storageKey, !c); return !c; });

  return (
    <Card className="gap-0 py-0">
      <CardHeader className={`py-0 ${collapsed ? '' : 'border-b [.border-b]:pb-0'}`}>
        <CardTitle className="text-base font-medium">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="needs-attention-list"
            className="flex w-full items-center gap-2 py-4 text-left"
          >
            <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            <span className="flex-1">Needs attention</span>
            {!loading ? (
              <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${due.length ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground'}`}>
                {due.length ? `${due.length} to look at` : 'All clear'}
              </span>
            ) : null}
          </button>
        </CardTitle>
      </CardHeader>
      {collapsed ? null : (
      <CardContent id="needs-attention-list" className="p-0">
        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : due.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <CircleCheck aria-hidden="true" className="size-4 text-good" />
            Nothing needs you right now.
          </p>
        ) : (
          <ul className="divide-y">
            {due.map(({ key, tone, icon: Icon, count, text, to }) => (
              <li key={key}>
                <Link to={to} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                  <span className={`rounded-full p-1.5 ${TONE[tone]}`}>
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">{text(count)}</span>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      )}
    </Card>
  );
}
