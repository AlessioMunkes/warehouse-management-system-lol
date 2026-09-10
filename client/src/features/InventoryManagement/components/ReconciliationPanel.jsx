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
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const fmt = (n) => (Math.round(Number(n) * 1000) / 1000).toLocaleString("en-ZA");

export default function ReconciliationPanel({ data, isLoading }) {
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
      <div className="rounded-md border border-[#ef3a40] bg-[#fff4f2] px-4 py-3">
        <p className="text-sm font-medium text-[#ef3a40]">
          {variances.length} product{variances.length === 1 ? "" : "s"} out of balance
        </p>
        <p className="mt-1 text-xs text-[#8a2a2e]">
          The quantity on hand does not equal the sum of recorded movements. Something
          changed a balance without writing to the ledger — start with the most recent
          movements for these products.
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-[110px]">SKU</TableHead>
              <TableHead className="w-[120px] text-right">On hand</TableHead>
              <TableHead className="w-[120px] text-right">Ledger sum</TableHead>
              <TableHead className="w-[120px] text-right">Variance</TableHead>
              <TableHead className="w-[110px] text-right">Movements</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variances.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-[240px] truncate font-medium" title={r.name}>
                  {r.name}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.sku}</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmt(r.balance)} {r.unit}</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmt(r.ledgerSum)}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="border-[#ef3a40] font-mono text-[#ef3a40]">
                    {r.variance > 0 ? "+" : ""}{fmt(r.variance)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {r.movementCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
