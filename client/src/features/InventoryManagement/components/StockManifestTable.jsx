// ─────────────────────────────────────────────────────────────
// StockManifestTable.jsx
//
// Searchable manifest table using CSS classes for status badges and layouts.
// ─────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, History, Edit3 } from "lucide-react";

function renderStatusBadge(product) {
  if (product.isShortfall) {
    return <Badge className="badge-shortfall">Shortfall</Badge>;
  }
  if (product.isLowStock) {
    return <Badge className="badge-lowstock">Low stock</Badge>;
  }
  return <Badge className="badge-instock">In stock</Badge>;
}

export default function StockManifestTable({
  products = [],
  isLoading = false,
  canAdjust = false,
  onAdjust,
  onViewHistory,
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const q = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
        <div>
          <CardTitle className="text-xl font-bold tracking-tight">
            Stock Manifest
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Current levels, reorder thresholds, and quick actions.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name or SKU..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading stock levels...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No matching products found.
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">SKU</TableHead>
                  <TableHead className="font-semibold">On Hand</TableHead>
                  <TableHead className="font-semibold">Reorder At</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">
                      {product.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {product.sku}
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.onHand} {product.unit}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.reorderAt} {product.unit}
                    </TableCell>
                    <TableCell>{renderStatusBadge(product)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canAdjust && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAdjust?.(product)}
                            className="h-8 gap-1"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Adjust</span>
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewHistory?.(product)}
                          className="h-8 gap-1"
                        >
                          <History className="h-3.5 w-3.5" />
                          <span>History</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}