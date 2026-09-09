// ─────────────────────────────────────────────────────────────
// features/purchaseOrders/components/PurchaseOrderLines.jsx
//
// The line-item repeater. Nothing like it existed — ProofOfDeliveryForm
// populates its rows FROM a purchase order rather than building them —
// so this is the one genuinely new interaction in the slice.
//
// SELECT, NOT COMBOBOX.
// components/ui/combobox.jsx exists, but its only use in the codebase
// is ProductMatchComboBox.jsx, which is an unwired stub carrying a
// "needs wiring to your real products endpoint" note — nobody has
// composed the Base UI primitive successfully here yet. Select is
// proven in DataUpload, ReportBuilder and StockManifestTable, so this
// follows those. If a working Combobox lands, this and the supplier
// picker are the two places that should switch: a warehouse with
// several hundred stock codes wants type-ahead, not a scroll.
//
// The low-stock button is the mitigation in the meantime. It is also
// the better interaction on its own merits — reorder_threshold is
// already populated, so the system knows what is running out and
// Grizel should not have to remember.
// ─────────────────────────────────────────────────────────────
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Badge }    from '@/components/ui/badge';
import { FieldError, FieldDescription } from '@/components/ui/field';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, PackageSearch } from 'lucide-react';

export const blankLine = () => ({
  // A client-side key so React can track a row that has no id yet.
  // Array index would do the wrong thing the moment a middle row is
  // removed: every row below it would re-key and lose focus.
  key: `line-${Math.random().toString(36).slice(2, 10)}`,
  productId: '',
  expectedQuantity: '',
  expectedWeightKg: '',
  unitPrice: '',
});

const money = (value) =>
  `R ${Number(value || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export default function PurchaseOrderLines({
  lines,
  products,
  onChange,
  disabled = false,
  invalidProductIds = [],
}) {
  const chosen = new Set(lines.map((l) => Number(l.productId)).filter(Boolean));

  const update = (key, patch) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addLine = () => onChange([...lines, blankLine()]);

  const removeLine = (key) => {
    const next = lines.filter((l) => l.key !== key);
    // Never leave the table empty. An order with no rows offers no
    // obvious way back to having one, and the server rejects it anyway.
    onChange(next.length ? next : [blankLine()]);
  };

  // Seeds rows from products already below their reorder threshold,
  // skipping any the manager has added by hand. isLowStock is computed
  // in SQL from AVAILABLE rather than on hand, so this agrees with what
  // the inventory screen calls low — see stockAPI.js.
  const addLowStock = () => {
    const low = products.filter((p) => p.isLowStock && !chosen.has(p.id));
    if (!low.length) return;
    const seeded = low.map((p) => ({
      ...blankLine(),
      productId: String(p.id),
      // Suggests the shortfall, rounded up. A suggestion, not a
      // decision — the manager overwrites it constantly and should.
      expectedQuantity: String(Math.max(1, Math.ceil(p.reorderAt - p.available))),
    }));
    // Drop the trailing empty row rather than stranding it mid-table.
    const kept = lines.filter((l) => l.productId !== '' || l.expectedQuantity !== '');
    onChange([...kept, ...seeded]);
  };

  const estimatedTotal = lines.reduce((sum, l) => {
    const qty   = Number(l.expectedQuantity || 0);
    const price = Number(l.unitPrice || 0);
    return sum + (Number.isFinite(qty * price) ? qty * price : 0);
  }, 0);

  const lowStockCount = products.filter((p) => p.isLowStock && !chosen.has(p.id)).length;

  return (
    <div className="space-y-3">
      {/* overflow-x-auto because five columns do not fit a phone, and
          the manager may well be standing in the warehouse. */}
      <div className="overflow-x-auto rounded-[4px] border-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">Item</TableHead>
              <TableHead className="w-[110px]">Quantity</TableHead>
              <TableHead className="w-[120px]">Weight (kg)</TableHead>
              <TableHead className="w-[130px]">Unit price</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const productId = Number(line.productId);
              const product   = products.find((p) => p.id === productId);
              const rejected  = invalidProductIds.includes(productId);
              // A product already on another row. Disabled rather than
              // hidden, so the list does not reshuffle underneath the
              // manager mid-scroll.
              const isDuplicate = (id) => chosen.has(id) && id !== productId;

              return (
                <TableRow key={line.key} data-invalid={rejected || undefined}>
                  <TableCell>
                    <Select
                      value={line.productId ? String(line.productId) : undefined}
                      onValueChange={(v) => update(line.key, { productId: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger
                        aria-label={`Item for line ${index + 1}`}
                        className={rejected ? 'border-[#ef3a40]' : undefined}
                      >
                        <SelectValue placeholder="Choose a stock item" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem
                            key={p.id}
                            value={String(p.id)}
                            disabled={isDuplicate(p.id)}
                          >
                            {p.name}{p.sku ? ` · ${p.sku}` : ''}
                            {p.isLowStock ? ' · low' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {rejected ? (
                      <FieldError className="mt-1">
                        Not a configured stock code.
                      </FieldError>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    <Input
                      type="number" min="1" step="1"
                      aria-label={`Quantity for line ${index + 1}`}
                      value={line.expectedQuantity}
                      onChange={(e) => update(line.key, { expectedQuantity: e.target.value })}
                      disabled={disabled}
                    />
                    {product?.unit ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {product.unit}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    {/* Optional on purpose. Dry goods arrive in counted
                        units with no meaningful weight, and a required
                        field here gets zeros typed in that later read
                        as "we expected 0kg". */}
                    <Input
                      type="number" min="0" step="0.001"
                      aria-label={`Expected weight for line ${index + 1}`}
                      placeholder="—"
                      value={line.expectedWeightKg}
                      onChange={(e) => update(line.key, { expectedWeightKg: e.target.value })}
                      disabled={disabled}
                    />
                  </TableCell>

                  <TableCell>
                    <Input
                      type="number" min="0" step="0.01"
                      aria-label={`Unit price for line ${index + 1}`}
                      placeholder="—"
                      value={line.unitPrice}
                      onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                      disabled={disabled}
                    />
                  </TableCell>

                  <TableCell>
                    <Button
                      type="button" variant="ghost" size="icon-sm"
                      onClick={() => removeLine(line.key)}
                      disabled={disabled}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={addLine} disabled={disabled}>
          <Plus /> Add line
        </Button>

        {lowStockCount ? (
          <Button type="button" variant="outline" onClick={addLowStock} disabled={disabled}>
            <PackageSearch /> Add {lowStockCount} low-stock {lowStockCount === 1 ? 'item' : 'items'}
          </Button>
        ) : null}

        <span className="ml-auto text-sm text-muted-foreground">
          Estimated total <Badge variant="secondary">{money(estimatedTotal)}</Badge>
        </span>
      </div>

      <FieldDescription>
        Prices are optional and only used for the estimate — the invoice is what gets paid.
      </FieldDescription>
    </div>
  );
}
