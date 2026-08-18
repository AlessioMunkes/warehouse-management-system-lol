// ─────────────────────────────────────────────────────────────
// MovementHistory.jsx
//
// Audit drawer for product movements using clean CSS classes.
// ─────────────────────────────────────────────────────────────

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  receipt: "Goods received",
  pick: "Picked for dispatch",
  decant: "Decanting",
  wastage: "Wastage",
};

const formatWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function MovementHistory({
  product,
  movements = [],
  isLoading = false,
  error = null,
  onClose,
}) {
  if (!product) return null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>
            SKU: {product.sku} · {product.onHand} {product.unit} on hand.
            Immutable stock movement log.
          </SheetDescription>
        </SheetHeader>

        <div className="py-6">
          {isLoading ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Loading movement history...
            </p>
          ) : error ? (
            <div className="p-3 text-sm rounded bg-rose-50 text-rose-700 border border-rose-200">
              {error}
            </div>
          ) : movements.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No movements recorded for this product yet.
            </p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatWhen(m.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            m.quantity < 0
                              ? "badge-shortfall"
                              : "badge-instock"
                          }
                        >
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}{" "}
                          {m.unit}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {TYPE_LABEL[m.movementType] ?? m.movementType}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground movement-table-cell-truncated">
                        {m.reason || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.performedByName}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}