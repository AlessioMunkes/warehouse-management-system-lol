// ─────────────────────────────────────────────────────────────
// LedgerTable.jsx
//
// The warehouse-wide movement list. Chronological by default; any
// column can be clicked to sort, and the page fetches the rest of the
// period first so a sort is over all of it (StockLedgerPage sortLedger).
//
// REFERENCE
// What the movement came from, as something to open: a dispatch links
// to its picking slip, a receipt to its purchase order (resolved
// server-side — see stock.repository.js getLedger). Anything else
// (a donation, decanting, a manual adjustment) has no screen of its own
// and is named in words.
// ─────────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import StatusBadge from "@/components/ui/status-badge";
import SortableHead from "@/components/ui/sortable-head";
import { TYPE_LABEL } from "./ledgerSort";
import { STAFF } from "../../routes/paths";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";

// Colour, fill and icon per movement type: lib/statusStyles.js (ledger).

const fmtWhen = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
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

const REFERENCE_WORDS = {
  donation: "Donation",
  donation_intake: "Donation intake",
  decanting: "Decanting",
  manual_adjustment: "Manual adjustment",
  delivery_note: "Delivery",
  dispatch_event: "Dispatch",
};

const Reference = ({ m }) => {
  const link = "text-sm underline-offset-2 hover:underline";
  if (m.purchaseOrderId) {
    return <Link className={link} to={`${STAFF.purchaseOrders}?id=${m.purchaseOrderId}`}>{m.poNumber || "Purchase order"}</Link>;
  }
  if (m.pickingSlipId) {
    return (
      <Link className={link} to={`${STAFF.pickingSlips}?open=${m.pickingSlipId}`}>
        {m.pickingSlipName ? `Slip · ${m.pickingSlipName}` : "Picking slip"}
      </Link>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {REFERENCE_WORDS[m.referenceType] ?? (m.referenceType ? m.referenceType.replace(/_/g, " ") : "-")}
    </span>
  );
};

// `show(key)`: whether a column is on (useTableView's isVisible).
export default function LedgerTable({ rows, isLoading, sort = null, onSort = () => {}, show = () => true }) {
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
          Widen the period, or clear the filters to see everything.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="When" sortKey="when" sort={sort} onSort={onSort} className="w-[150px] pl-4" />
          {show('product') ? <SortableHead label="Product" sortKey="product" sort={sort} onSort={onSort} /> : null}
          {show('type') ? <SortableHead label="Type" sortKey="type" sort={sort} onSort={onSort} className="w-[150px]" /> : null}
          {show('change') ? <SortableHead label="Change" sortKey="change" sort={sort} onSort={onSort} align="right" className="w-[110px]" /> : null}
          {show('balance') ? <SortableHead label="Balance after" sortKey="balance" sort={sort} onSort={onSort} align="right" className="w-[120px]" /> : null}
          {show('reference') ? <SortableHead label="Reference" sortKey="reference" sort={sort} onSort={onSort} /> : null}
          {show('by') ? <SortableHead label="By" sortKey="by" sort={sort} onSort={onSort} className="w-[110px]" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="whitespace-nowrap pl-4 text-xs text-muted-foreground">
              {fmtWhen(m.createdAt)}
            </TableCell>
            {show('product') ? (
              <TableCell className="max-w-[240px] whitespace-normal">
                <span className="block break-words font-medium">{m.productName}</span>
                <span className="block text-xs text-muted-foreground">{m.sku}</span>
                {/* The reason a person typed, where there was one. */}
                {m.reason ? <span className="block break-words text-xs text-muted-foreground">{m.reason}</span> : null}
              </TableCell>
            ) : null}
            {show('type') ? (
              <TableCell>
                <StatusBadge kind="ledger" status={m.movementType}>
                  {TYPE_LABEL[m.movementType] ?? m.movementType}
                </StatusBadge>
              </TableCell>
            ) : null}
            {show('change') ? (
              <TableCell className={`text-right tabular-nums ${m.quantity < 0 ? "text-danger" : ""}`}>
                {fmtQty(m.quantity)} {m.unit}
              </TableCell>
            ) : null}
            {show('balance') ? (
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {(Math.round(m.balanceAfter * 1000) / 1000).toLocaleString("en-ZA")}
              </TableCell>
            ) : null}
            {show('reference') ? (
              <TableCell className="max-w-[220px] whitespace-normal"><Reference m={m} /></TableCell>
            ) : null}
            {show('by') ? (
              <TableCell className="text-xs">{m.performedByName}</TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
