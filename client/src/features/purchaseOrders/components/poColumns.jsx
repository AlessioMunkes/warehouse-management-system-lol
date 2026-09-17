// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/components/poColumns.jsx
//
// The purchase-order table's columns, in the shape useTableView and
// MasterDataTable already understand — one definition driving the
// header, the sort accessor, the cell and the Columns menu, so hiding
// a column cannot leave its cells behind.
//
// Its own module rather than an export beside PurchaseOrderList:
// react-refresh/only-export-components is an error in this project, so
// a file that exports a component and a constant fails the build.
//
// Numeric columns say so. "10" sorts before "9" as text, and a
// purchase order for R 9 000 is not larger than one for R 10 000.
// ─────────────────────────────────────────────────────────────
import { Badge } from '@/components/ui/badge';
import { OPEN_PO_STATUSES } from '@/services/purchaseOrderAPI';

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const money = (value) =>
  `R ${Number(value || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

// BR-07C: returned and follow-up-required are the two the manager is
// meant to notice, so they get the destructive badge rather than
// sitting quietly in a list of six greys.
const badgeVariant = (status) => {
  if (status === 'returned' || status === 'follow_up_required') return 'destructive';
  if (status === 'completed') return 'secondary';
  return 'outline';
};

export const PO_COLUMNS = [
  { key: 'poNumber', label: 'PO number', alwaysOn: true, weight: 2.2,
    sort: (po) => (po.poNumber ?? '').toLowerCase(),
    cellClass: 'font-medium',
    cell: (po) => po.poNumber },

  { key: 'supplier', label: 'Supplier', weight: 3, minWidth: 'sm',
    sort: (po) => (po.supplierName ?? '').toLowerCase(),
    cellClass: '',
    cell: (po) => po.supplierName },

  // Sorted by the label the manager reads, not the raw enum — the
  // on-screen order looks wrong otherwise.
  { key: 'status', label: 'Status', alwaysOn: true, weight: 2.6,
    sort: (po) => (po.statusLabel ?? po.status ?? '').toLowerCase(),
    cellClass: '',
    cell: (po) => (
      <>
        <Badge variant={badgeVariant(po.status)}>{po.statusLabel}</Badge>
        {/* An instalment count only means something while the order is
            still open — BR-07A partial receipts. */}
        {po.receiptCount > 0 && OPEN_PO_STATUSES.includes(po.status) ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {po.receiptCount} received
          </span>
        ) : null}
      </>
    ) },

  { key: 'expected', label: 'Expected', weight: 2.2, minWidth: 'md',
    // The raw value, not the formatted one: "9 Sept" sorts before
    // "10 Aug" as text. An order with no date sorts last either way.
    numeric: true,
    sort: (po) => (po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).getTime() : null),
    cell: (po) => fmtDate(po.expectedDeliveryDate) },

  { key: 'lines', label: 'Lines', weight: 1.3, minWidth: 'lg', numeric: true,
    sort: (po) => Number(po.lineCount ?? 0),
    cellClass: 'text-right',
    cell: (po) => po.lineCount },

  { key: 'estimated', label: 'Estimated', weight: 2.4, minWidth: 'lg', numeric: true,
    sort: (po) => Number(po.estimatedValue ?? 0),
    cellClass: 'text-right',
    cell: (po) => money(po.estimatedValue) },
];
