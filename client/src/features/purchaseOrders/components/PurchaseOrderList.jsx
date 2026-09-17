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
import MasterDataTable from '@/features/masterdata/components/MasterDataTable';

export default function PurchaseOrderList({
  purchaseOrders, selectedId, onSelect, columns, sort, onToggleSort,
}) {
  if (!purchaseOrders.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No purchase orders match this filter.
      </p>
    );
  }

  return (
    <div className="rounded-[4px] border-2">
      <MasterDataTable
        columns={columns}
        rows={purchaseOrders}
        sort={sort}
        onToggleSort={onToggleSort}
        onOpenRow={(po) => onSelect(po.id)}
        // Keeps the selected-row highlight the detail panel relies on.
        rowAttrs={(po) => (po.id === selectedId ? { 'data-state': 'selected' } : {})}
      />
    </div>
  );
}
