// ─────────────────────────────────────────────────────────────
// features/purchaseOrders/PurchaseOrderList.jsx
//
// The manager's PO table. Renders through MasterDataTable now, so the
// sort arrows, the click-to-open row and the never-scrolls-sideways
// layout are the same ones Products, Suppliers, Users and the guest log
// use — one table behaviour in the app rather than five.
//
// The columns themselves live in poColumns.jsx, and the page owns the
// view state (useTableView), because the Columns control belongs up in
// the toolbar beside the tabs and the status filter rather than
// floating above the table on its own.
//
// The "Open" button is gone. The whole row opens the order, which is
// what the row looked like it did anyway — and a button in its own
// column was costing width the estimated value needed.
// ─────────────────────────────────────────────────────────────
import { ShoppingCart } from 'lucide-react';
import MasterDataTable from '@/features/masterdata/MasterDataTable';
import EmptyState from '@/components/ui/empty-state';

export default function PurchaseOrderList({
  purchaseOrders, selectedId, onSelect, onIntent, columns, sort, onToggleSort,
}) {
  if (!purchaseOrders.length) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No purchase orders here"
        description="No order matches this view and search."
      />
    );
  }

  return (
    // Bare: the page's ListCard is the card, with the toolbar above.
    <MasterDataTable
        columns={columns}
        rows={purchaseOrders}
        sort={sort}
        onToggleSort={onToggleSort}
        onOpenRow={(po) => onSelect(po.id)}
        onRowIntent={onIntent ? (po) => onIntent(po.id) : undefined}
        // Keeps the selected-row highlight the detail panel relies on.
        rowAttrs={(po) => (po.id === selectedId ? { 'data-state': 'selected' } : {})}
        noun="orders"
      />
  );
}
