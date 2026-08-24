// ─────────────────────────────────────────────────────────────
// features/purchaseOrders/components/PurchaseOrderList.jsx
//
// The manager's PO table. Same Table + Badge treatment as the supplier
// directory, so the two manager screens read as one app.
// ─────────────────────────────────────────────────────────────
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { OPEN_PO_STATUSES } from '@/services/purchaseOrderAPI';

// Same formatter as SupplierDirectoryPage — en-ZA, and an em dash for
// nothing recorded rather than a blank cell that reads as a bug.
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
  if (status === 'received') return 'secondary';
  return 'outline';
};

export default function PurchaseOrderList({ purchaseOrders, selectedId, onSelect }) {
  if (!purchaseOrders.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No purchase orders match this filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[4px] border-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PO number</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expected</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead className="text-right">Estimated</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseOrders.map((po) => (
            <TableRow
              key={po.id}
              data-state={po.id === selectedId ? 'selected' : undefined}
            >
              <TableCell className="font-medium">{po.poNumber}</TableCell>
              <TableCell>{po.supplierName}</TableCell>
              <TableCell>
                <Badge variant={badgeVariant(po.status)}>{po.statusLabel}</Badge>
                {/* An instalment count only means something while the
                    order is still open — BR-07A partial receipts. */}
                {po.receiptCount > 0 && OPEN_PO_STATUSES.includes(po.status) ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {po.receiptCount} received
                  </span>
                ) : null}
              </TableCell>
              <TableCell>{fmtDate(po.expectedDeliveryDate)}</TableCell>
              <TableCell className="text-right">{po.lineCount}</TableCell>
              <TableCell className="text-right">{money(po.estimatedValue)}</TableCell>
              <TableCell>
                <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(po.id)}>
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
