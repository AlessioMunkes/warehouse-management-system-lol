// ─────────────────────────────────────────────────────────────
// LedgerTable.jsx
//
// The warehouse-wide movement list. Deliberately NOT a copy of
// StockManifestTable: this one has no client-side sort, because the
// ledger is chronological by definition and re-sorting it by quantity
// would make the running balance column meaningless.
// ─────────────────────────────────────────────────────────────
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// Same keys the database stores. Kept in step with
// server/src/constants/movementTypes.js.
const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  decanted:   "Decanting",
  dispatched: "Dispatched",
  donated:    "Donation",
  picked:     "Picked",
  received:   "Received",
  wastage:    "Wastage",
};

// Tone follows what the movement means, not its sign: wastage is a
// loss even though a manual correction downward is not.
const TYPE_TONE = {
  wastage:    "border-[#ef3a40] text-[#ef3a40]",
  adjustment: "border-[#b8860b] text-[#8a6508]",
};

const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Africa/Johannesburg explicitly: a manager opening this from a
  // laptop still set to another timezone should see warehouse time,
  // which is also the timezone the server filtered on.
  return d.toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const fmtQty = (n) => {
  const rounded = Math.round(Number(n) * 1000) / 1000;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-ZA")}`;
};

export default function LedgerTable({ rows, isLoading }) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm font-medium">No stock movements match these filters.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Widen the date range, or clear the filters to see everything.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">When</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="w-[110px]">SKU</TableHead>
            <TableHead className="w-[140px]">Type</TableHead>
            <TableHead className="w-[110px] text-right">Change</TableHead>
            <TableHead className="w-[120px] text-right">Balance after</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="w-[110px]">By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {fmtWhen(m.createdAt)}
              </TableCell>
              <TableCell className="max-w-[220px] truncate font-medium" title={m.productName}>
                {m.productName}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{m.sku}</TableCell>
              <TableCell>
                <Badge variant="outline" className={TYPE_TONE[m.movementType] || ""}>
                  {TYPE_LABEL[m.movementType] ?? m.movementType}
                </Badge>
              </TableCell>
              <TableCell
                className={`text-right font-mono text-sm ${m.quantity < 0 ? "text-[#ef3a40]" : ""}`}
              >
                {fmtQty(m.quantity)} {m.unit}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground">
                {(Math.round(m.balanceAfter * 1000) / 1000).toLocaleString("en-ZA")}
              </TableCell>
              <TableCell className="max-w-[260px] truncate text-xs" title={m.reason || ""}>
                {m.reason || (m.referenceType ? m.referenceType.replace(/_/g, " ") : "—")}
              </TableCell>
              <TableCell className="text-xs">{m.performedByName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
