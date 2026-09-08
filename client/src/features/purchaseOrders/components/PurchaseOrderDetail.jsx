// ─────────────────────────────────────────────────────────────
// features/purchaseOrders/components/PurchaseOrderDetail.jsx
//
// Read-only. Same Card + close-button shape as SupplierDetail in
// SupplierDirectoryPage.jsx, so opening a PO feels like opening a
// supplier.
//
// The received column is the whole point of the panel. It comes from
// delivery_note_items summed across every delivery note logged against
// the line, which is how BR-07A partial instalments work without a
// separate receipts table — one PO, many delivery notes.
// ─────────────────────────────────────────────────────────────
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { X } from 'lucide-react';

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const money = (value) =>
  `R ${Number(value || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export default function PurchaseOrderDetail({ purchaseOrder: po, onClose }) {
  const facts = [
    ['Supplier',   po.supplierName],
    ['Status',     po.statusLabel],
    ['Expected',   fmtDate(po.expectedDeliveryDate)],
    ['Raised by',  po.createdByName || '—'],
    ['Raised on',  fmtDate(po.createdAt)],
    ['QuickBooks', po.quickbooksPoId || 'Not linked'],
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{po.poNumber}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {po.lineCount} {po.lineCount === 1 ? 'line' : 'lines'} · {money(po.estimatedValue)} estimated
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {/* BR-07B makes this mandatory on Returned, and migration 002
            enforces it in SQL — so if the status is returned, there is
            a reason and it belongs on screen. */}
        {po.statusReason ? (
          <div className="rounded-[4px] border-2 border-[#ef3a40] bg-[#fff4f2] p-3 text-sm">
            <span className="font-semibold">{po.statusLabel}:</span> {po.statusReason}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-[4px] border-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((line) => {
                const outstanding = line.expectedQuantity - line.receivedToDate;
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      {line.productName}
                      {line.sku ? (
                        <span className="block text-xs text-muted-foreground">{line.sku}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.expectedQuantity}{line.defaultUnit ? ` ${line.defaultUnit}` : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.receivedToDate}
                      {outstanding > 0 && line.receivedToDate > 0 ? (
                        <Badge variant="outline" className="ml-2">{outstanding} short</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.unitPrice === null ? '—' : money(line.unitPrice)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {po.notes ? (
          <div>
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="text-sm">{po.notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
