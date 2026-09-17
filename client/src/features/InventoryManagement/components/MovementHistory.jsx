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

// Import custom CSS
import "../../../styles/index.css"; // Adjust path to match your folder structure

// Keys are the values the database actually stores — the
// movement_type CHECK constraint, mirrored in reportCatalog.js's
// MOVEMENT_TYPES. Three of these were previously singular forms
// ('receipt', 'pick', 'decant') that no row could ever match, and
// 'donated' and 'dispatched' were missing entirely, so the drawer
// fell through to `?? m.movementType` and showed managers the raw
// enum value on every real row.
const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  decanted:   "Decanting",
  dispatched: "Dispatched to beneficiary",
  donated:    "Donation received",
  picked:     "Picked for dispatch",
  received:   "Goods received",
  wastage:    "Wastage",
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
      <SheetContent className="movement-sheet-content">
        <SheetHeader className="movement-sheet-header">
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>
            SKU: {product.sku} · {product.onHand} {product.unit} on hand.
            Immutable stock movement log.
          </SheetDescription>
        </SheetHeader>

        <div className="movement-body-wrapper">
          {isLoading ? (
            <p className="movement-placeholder-text">
              Loading movement history...
            </p>
          ) : error ? (
            <div className="movement-error-banner">
              {error}
            </div>
          ) : movements.length === 0 ? (
            <p className="movement-placeholder-text">
              No movements recorded for this product yet.
            </p>
          ) : (
            <div className="movement-table-container">
              <Table>
                <TableHeader className="movement-table-header">
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
                      <TableCell className="movement-cell-date">
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
                      <TableCell className="movement-cell-type">
                        {TYPE_LABEL[m.movementType] ?? m.movementType}
                      </TableCell>
                      <TableCell className="movement-cell-reason">
                        {m.reason || "—"}
                      </TableCell>
                      <TableCell className="movement-cell-author">
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