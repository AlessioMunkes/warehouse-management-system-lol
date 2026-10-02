// ─────────────────────────────────────────────────────────────
// features/purchaseOrders/components/PurchaseOrderList.jsx
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
import MasterDataTable from '@/features/masterdata/components/MasterDataTable';
import { Card, CardContent } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';

export default function PurchaseOrderList({
  purchaseOrders, selectedId, onSelect, columns, sort, onToggleSort,
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
    // The same card every manager list sits in (Inventory, Picking
    // Slips); py-0 so the header row meets the card's top edge.
    <Card className="py-0">
      <CardContent className="p-0">
      <MasterDataTable
        columns={columns}
        rows={purchaseOrders}
        sort={sort}
        onToggleSort={onToggleSort}
        onOpenRow={(po) => onSelect(po.id)}
        // Keeps the selected-row highlight the detail panel relies on.
        rowAttrs={(po) => (po.id === selectedId ? { 'data-state': 'selected' } : {})}
      />
      </CardContent>
    </Card>
  );
}
