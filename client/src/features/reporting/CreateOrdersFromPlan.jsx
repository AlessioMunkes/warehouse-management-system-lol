// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/CreateOrdersFromPlan.jsx
//
// The reorder planner's "Create purchase orders": its suggestions, as
// orders. Every product in the planner's current view with a suggested
// order is put on an order to its supplier (the preferred one, or else
// the one it was last ordered from), one order per supplier, at the
// suggested quantity and the catalogue cost. Each order is due the
// longest lead time among its products from today.
//
// Shown first as a list of what would be raised, and raised only when
// the manager confirms. The orders are Pending approval, like any new
// order: approving one is still a separate decision, and nothing goes
// to a supplier or to QuickBooks until then. Products with no supplier
// to order from are named and left out.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPurchaseOrder } from '@/services/purchaseOrderAPI';
import { STAFF } from '@/routes/paths';
import { Link } from 'react-router-dom';
import { ordersFromPlan } from './ordersFromPlan';

const qty = (n) => Number(n ?? 0).toLocaleString('en-ZA', { maximumFractionDigits: 3 });
const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });


export default function CreateOrdersFromPlan({ items }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);   // [{ supplier, poNumber } | { supplier, error }]

  const { orders, noSupplier } = ordersFromPlan(items);
  if (orders.length === 0 && noSupplier.length === 0) return null;

  const create = async () => {
    setBusy(true);
    const done = [];
    for (const order of orders) {
      try {
        const po = await createPurchaseOrder({
          supplierId: order.supplierId,
          expectedDeliveryDate: order.expectedDeliveryDate,
          notes: 'Raised from the reorder planner.',
          items: order.lines.map((l) => ({
            productId: l.productId,
            expectedQuantity: Number(l.suggestedQuantity),
            expectedWeightKg: null,
            unitPrice: l.unitCost ?? null,
          })),
        });
        done.push({ supplier: order.supplier, poNumber: po.poNumber, id: po.id });
      } catch (err) {
        done.push({ supplier: order.supplier, error: err.message || 'Could not raise this order.' });
      }
    }
    setResults(done);
    setBusy(false);
  };

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => { setResults(null); setOpen(true); }}>
        <ClipboardList /> Create purchase orders
      </Button>
    );
  }

  return (
    <section aria-label="Create purchase orders" className="mt-3 w-full rounded-2xl border border-line p-4 text-sm">
      {results ? (
        <>
          <p className="font-medium">
            {results.filter((r) => r.poNumber).length} of {results.length} orders raised, waiting for approval.
          </p>
          <ul className="mt-2 space-y-1">
            {results.map((r) => (
              <li key={r.supplier}>
                {r.poNumber
                  ? <><Link className="font-medium underline underline-offset-2" to={`${STAFF.purchaseOrders}?id=${r.id}`}>{r.poNumber}</Link> to {r.supplier}</>
                  : <span className="text-danger">{r.supplier}: {r.error}</span>}
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setOpen(false)}>Done</Button>
        </>
      ) : (
        <>
          <p className="font-medium">
            {orders.length === 0
              ? 'None of these products has a supplier to order from.'
              : `Raise ${orders.length} ${orders.length === 1 ? 'order' : 'orders'} from the suggestions in this view?`}
          </p>
          <p className="mt-1 text-muted-foreground">
            Each order is Pending approval: nothing goes to a supplier until it is approved on Purchase orders.
          </p>
          {orders.map((o) => (
            <div key={o.supplierId} className="mt-3">
              <p className="font-medium">{o.supplier} · due {day(o.expectedDeliveryDate)}</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {o.lines.map((l) => <li key={l.productId}>{l.name}: {qty(l.suggestedQuantity)} {l.unit}</li>)}
              </ul>
            </div>
          ))}
          {noSupplier.length > 0 ? (
            <p className="mt-3 text-warn">
              Left out, with no supplier to order from: {noSupplier.map((i) => i.name).join(', ')}. Set a preferred supplier on the product.
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            {orders.length > 0 ? (
              <Button type="button" size="sm" disabled={busy} onClick={create}>
                {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Raising…' : `Raise ${orders.length === 1 ? 'order' : 'orders'}`}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </>
      )}
    </section>
  );
}
