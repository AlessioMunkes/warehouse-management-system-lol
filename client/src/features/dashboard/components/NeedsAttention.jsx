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
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import {
  ChevronRight, CircleCheck, CircleX, ClipboardList, Hourglass, PhoneCall,
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
  { key: 'pendingRequests', tone: 'warn', icon: PhoneCall, count: a.communityRequests.pending,
    text: (n) => `${plural(n, 'benevolent request is', 'benevolent requests are')} still open`,
    to: STAFF.communityRequests },
  { key: 'unassigned', tone: 'info', icon: ClipboardList, count: a.pickingSlips.unassigned,
    text: (n) => `${plural(n, 'slip', 'slips')} this week nobody has claimed yet`,
    to: `${STAFF.pickingSlips}?status=unassigned` },
];

const TONE = {
  bad:  'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
};

export default function NeedsAttention({ attention }) {
  const due = attention ? lines(attention).filter((l) => l.count > 0) : [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base font-medium">Needs attention</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!attention ? (
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
    </Card>
  );
}
