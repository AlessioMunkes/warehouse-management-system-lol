// ─────────────────────────────────────────────────────────────
// LedgerTable.jsx
//
// The warehouse-wide movement list. Deliberately NOT a copy of
// StockManifestTable: this one has no client-side sort, because the
// ledger is chronological by definition and re-sorting it by quantity
// would make the running balance column meaningless.
// ─────────────────────────────────────────────────────────────
import StatusBadge from "@/components/ui/status-badge";
import SortableHead from "@/components/ui/sortable-head";
import { TYPE_LABEL } from "../ledgerSort";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";


// Colour, fill and icon per movement type: lib/statusStyles.js (ledger).


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

export default function LedgerTable({ rows, isLoading, sort = null, onSort = () => {} }) {
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
            <SortableHead label="When" sortKey="when" sort={sort} onSort={onSort} className="w-[150px]" />
            <SortableHead label="Product" sortKey="product" sort={sort} onSort={onSort} />
            <SortableHead label="SKU" sortKey="sku" sort={sort} onSort={onSort} className="w-[110px]" />
            <SortableHead label="Type" sortKey="type" sort={sort} onSort={onSort} className="w-[140px]" />
            <SortableHead label="Change" sortKey="change" sort={sort} onSort={onSort} align="center" className="w-[110px]" />
            <SortableHead label="Balance after" sortKey="balance" sort={sort} onSort={onSort} align="center" className="w-[120px]" />
            <SortableHead label="Reason" sortKey="reason" sort={sort} onSort={onSort} />
            <SortableHead label="By" sortKey="by" sort={sort} onSort={onSort} className="w-[110px]" />
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
                <StatusBadge kind="ledger" status={m.movementType}>
                  {TYPE_LABEL[m.movementType] ?? m.movementType}
                </StatusBadge>
              </TableCell>
              <TableCell
                className={`text-center font-mono text-sm ${m.quantity < 0 ? "text-brand" : ""}`}
              >
                {fmtQty(m.quantity)} {m.unit}
              </TableCell>
              <TableCell className="text-center font-mono text-sm text-muted-foreground">
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
