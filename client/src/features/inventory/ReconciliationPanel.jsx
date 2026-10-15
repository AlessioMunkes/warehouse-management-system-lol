// ─────────────────────────────────────────────────────────────
// ReconciliationPanel.jsx
//
// Does quantity_on_hand still equal the sum of stock_movements?
//
// It should, for every product, because adjustStock writes both in one
// transaction. A row here means something wrote a balance without
// writing the ledger — which is precisely what donation intake did
// until it was routed through adjustStock.
//
// The empty state is the point of this screen, so it is written as a
// result rather than as an absence.
// ─────────────────────────────────────────────────────────────
import StatusBadge from '@/components/ui/status-badge';
import { VARIANCE_STYLE } from '@/lib/statusStyles';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import ListToolbar from "@/components/ui/list-toolbar";
import useTableView from "@/features/masterdata/useTableView";
import useListFilters from "@/features/masterdata/useListFilters";

// Every column but the product can be hidden from Columns.
const COLUMNS = [
  { key: "product", label: "Product", alwaysOn: true },
  { key: "sku", label: "SKU" },
  { key: "onHand", label: "On hand" },
  { key: "ledger", label: "Ledger sum" },
  { key: "variance", label: "Variance" },
  { key: "movements", label: "Movements" },
];
const FILTERS = [
  { key: "unit", label: "Unit", valueOf: (r) => r.unit },
  { key: "direction", label: "Variance", valueOf: (r) => (r.variance > 0 ? "over" : "under"),
    labelOf: (v) => (v === "over" ? "More on hand than the ledger" : "Less on hand than the ledger") },
];

const fmt = (n) => (Math.round(Number(n) * 1000) / 1000).toLocaleString("en-ZA");

export default function ReconciliationPanel({ data, isLoading }) {
  const view = useTableView("stockReconciliation", COLUMNS);
  const show = view.isVisible;
  const [search, setSearch] = useState("");
  const listFilters = useListFilters(FILTERS, data?.variances ?? []);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const products  = data?.products ?? [];
  const variances = data?.variances ?? [];

  if (variances.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm font-medium">
          Every balance matches its ledger.
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
          All {products.length} product{products.length === 1 ? "" : "s"} with stock
          history reconcile: what the system says is on hand is exactly the sum of
          every movement recorded against it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-brand bg-danger-soft px-4 py-3">
        <p className="text-sm font-medium text-brand">
          {variances.length} product{variances.length === 1 ? "" : "s"} out of balance
        </p>
        <p className="mt-1 text-xs text-danger">
          The quantity on hand does not equal the sum of recorded movements. Something
          changed a balance without writing to the ledger. Start with the most recent
          movements for these products.
        </p>
      </div>

      <ListToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Search by product or SKU" }}
        filters={listFilters.filters}
        onClearAll={() => { setSearch(""); listFilters.clear(); }}
        columns={{
          idPrefix: "reconciliation",
          columns: view.availableColumns,
          hidden: view.hidden,
          onToggle: view.toggleColumn,
          onReset: view.resetColumns,
        }}
      />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              {show("sku") ? <TableHead className="w-[110px]">SKU</TableHead> : null}
              {show("onHand") ? <TableHead className="w-[120px] text-center">On hand</TableHead> : null}
              {show("ledger") ? <TableHead className="w-[120px] text-center">Ledger sum</TableHead> : null}
              {show("variance") ? <TableHead className="w-[120px] text-center">Variance</TableHead> : null}
              {show("movements") ? <TableHead className="w-[110px] text-center">Movements</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listFilters.apply(variances)
              .filter((r) => !search.trim() || `${r.name} ${r.sku}`.toLowerCase().includes(search.trim().toLowerCase()))
              .map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-[240px] truncate font-medium" title={r.name}>
                  {r.name}
                </TableCell>
                {show("sku") ? <TableCell className="text-xs text-muted-foreground">{r.sku}</TableCell> : null}
                {show("onHand") ? <TableCell className="text-center font-mono text-sm">{fmt(r.balance)} {r.unit}</TableCell> : null}
                {show("ledger") ? <TableCell className="text-center font-mono text-sm">{fmt(r.ledgerSum)}</TableCell> : null}
                {show("variance") ? (
                  <TableCell className="text-center">
                    <StatusBadge {...VARIANCE_STYLE} className="font-mono">
                      {r.variance > 0 ? "+" : ""}{fmt(r.variance)}
                    </StatusBadge>
                  </TableCell>
                ) : null}
                {show("movements") ? (
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {r.movementCount}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
