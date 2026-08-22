// ─────────────────────────────────────────────────────────────
// StockManifestTable.jsx
//
// Searchable and filterable manifest table using CSS classes for status badges and
// layouts.
//
// THREE QUANTITIES, NOT ONE. "On hand" is what is physically in the
// building; some of it is already packed onto pallets waiting at the
// dispatch gate and cannot be promised to anyone else. The manager
// asking "can I still allocate this?" needs Available, and the
// manager asking "does the shelf count match?" needs On hand. Showing
// only one of them is what let the inventory screen and the packing
// screen disagree about how much rice there was.
//
// The status badge is derived from Available server-side — see
// server/src/repositories/stock.repository.js getManifest.
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  History,
  Edit3,
  Filter,
  RotateCcw,
  Calendar,
} from "lucide-react";

import "../../../styles/landingpage.css";

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
  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'shortfall' | 'lowstock' | 'instock'
  const [datePreset, setDatePreset] = useState("all"); // 'all' | '7d' | '30d' | 'stale' | 'custom'
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hasCommitted, setHasCommitted] = useState(false);
  const [needsReorder, setNeedsReorder] = useState(false);

  // Active Filters Count (excluding search)
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (datePreset !== "all") count++;
    if (hasCommitted) count++;
    if (needsReorder) count++;
    return count;
  }, [statusFilter, datePreset, hasCommitted, needsReorder]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDatePreset("all");
    setStartDate("");
    setEndDate("");
    setHasCommitted(false);
    setNeedsReorder(false);
  };

  const filteredProducts = useMemo(() => {
    const now = new Date();

    return products.filter((p) => {
      // 1. Text Search (Name, SKU, Barcode / EAN)
      const q = searchTerm.toLowerCase().trim();
      if (q) {
        const matchesName = p.name?.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q);
        const matchesBarcode =
          p.barcode?.toLowerCase().includes(q) ||
          p.ean?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBarcode) return false;
      }

      // 2. Status Filter
      if (statusFilter === "shortfall" && !p.isShortfall) return false;
      if (statusFilter === "lowstock" && !p.isLowStock) return false;
      if (
        statusFilter === "instock" &&
        (p.isShortfall || p.isLowStock)
      ) {
        return false;
      }

      // 3. Inventory Rules
      if (hasCommitted && !(p.committed > 0)) return false;
      if (needsReorder && !(p.available <= p.reorderAt)) return false;

      // 4. Date / Recency Filter
      const activityDateStr = p.lastActivityAt || p.updatedAt || p.lastCountedAt;
      if (datePreset !== "all") {
        if (!activityDateStr) return false;
        const activityDate = new Date(activityDateStr);
        const diffInDays =
          (now.getTime() - activityDate.getTime()) / (1000 * 3600 * 24);

        if (datePreset === "7d" && diffInDays > 7) return false;
        if (datePreset === "30d" && diffInDays > 30) return false;
        if (datePreset === "stale" && diffInDays <= 60) return false; // Stale = >60 days idle

        if (datePreset === "custom") {
          if (startDate && new Date(activityDateStr) < new Date(startDate)) {
            return false;
          }
          if (endDate && new Date(activityDateStr) > new Date(endDate)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [
    products,
    searchTerm,
    statusFilter,
    datePreset,
    startDate,
    endDate,
    hasCommitted,
    needsReorder,
  ]);

  return (
    <Card className="stock-manifest-card">
      <CardHeader className="stock-manifest-header">
        {/* Title and Primary Search */}
        <div className="stock-manifest-topbar">
          <div>
            <CardTitle className="stock-manifest-title">
              Stock Manifest
            </CardTitle>
            <p className="stock-manifest-description">
              Current levels, reorder thresholds, and quick actions.
            </p>
          </div>

          <div className="stock-manifest-search">
            <Search className="stock-search-icon" />
            <Input
              type="search"
              placeholder="Search name, SKU, or barcode..."
              className="stock-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="stock-manifest-filters">
          {/* Status Pills */}
          <div className="stock-status-pills">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
              className="stock-pill-btn"
            >
              All Statuses
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusFilter("shortfall")}
              className={`stock-pill-btn ${
                statusFilter === "shortfall" ? "ring-2 ring-destructive" : ""
              }`}
            >
              <Badge className="badge-shortfall stock-filter-badge">
                Shortfall
              </Badge>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusFilter("lowstock")}
              className={`stock-pill-btn ${
                statusFilter === "lowstock" ? "ring-2 ring-warning" : ""
              }`}
            >
              <Badge className="badge-lowstock stock-filter-badge">
                Low stock
              </Badge>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusFilter("instock")}
              className={`stock-pill-btn ${
                statusFilter === "instock" ? "ring-2 ring-success" : ""
              }`}
            >
              <Badge className="badge-instock stock-filter-badge">
                In stock
              </Badge>
            </Button>
          </div>

          {/* Popover Controls & Reset */}
          <div className="stock-actions-group">
            {/* Extended Filters Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="stock-filter-btn">
                  <Filter className="h-3.5 w-3.5" />
                  <span>Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="stock-filter-count">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="stock-popover-content" align="end">
                <div className="stock-popover-grid">
                  <div className="stock-popover-section">
                    <h4 className="stock-popover-heading">Inventory Rules</h4>
                    <p className="stock-popover-subtext">
                      Filter products matching operational conditions.
                    </p>
                  </div>

                  <div className="stock-checkbox-group">
                    <label className="stock-checkbox-label">
                      <Checkbox
                        checked={hasCommitted}
                        onCheckedChange={(checked) =>
                          setHasCommitted(Boolean(checked))
                        }
                      />
                      <span>Has Committed Stock (&gt; 0)</span>
                    </label>

                    <label className="stock-checkbox-label">
                      <Checkbox
                        checked={needsReorder}
                        onCheckedChange={(checked) =>
                          setNeedsReorder(Boolean(checked))
                        }
                      />
                      <span>Reorder Required (Available &le; Threshold)</span>
                    </label>
                  </div>

                  <div className="stock-date-section">
                    <label className="stock-date-label">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Activity &amp; Recency Date</span>
                    </label>
                    <Select value={datePreset} onValueChange={setDatePreset}>
                      <SelectTrigger className="stock-select-trigger">
                        <SelectValue placeholder="Select timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="stock-select-item">All Time</SelectItem>
                        <SelectItem value="7d" className="stock-select-item">Active in Last 7 Days</SelectItem>
                        <SelectItem value="30d" className="stock-select-item">Active in Last 30 Days</SelectItem>
                        <SelectItem value="stale" className="stock-select-item">Stale / Idle (&gt; 60 Days)</SelectItem>
                        <SelectItem 
                          value="custom" 
                          className="stock-custom-item"
                        >
                          Custom Date Range
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {datePreset === "custom" && (
                      <div className="stock-date-range-grid">
                        <div className="stock-date-input-group">
                          <span className="stock-date-sublabel">From</span>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="stock-date-input"
                          />
                        </div>
                        <div className="stock-date-input-group">
                          <span className="stock-date-sublabel">To</span>
                          <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="stock-date-input"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Reset Button */}
            {(activeFiltersCount > 0 || searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="stock-reset-btn"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="stock-empty-state">
            Loading stock levels...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="stock-empty-state">
            <p>No matching products found.</p>
            {(activeFiltersCount > 0 || searchTerm) && (
              <Button
                variant="link"
                size="sm"
                onClick={handleResetFilters}
                className="mt-2 text-xs"
              >
                Clear all active filters
              </Button>
            )}
          </div>
        ) : (
          <div className="stock-table-wrapper">
            <Table>
              <TableHeader className="stock-table-header">
                <TableRow>
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">SKU</TableHead>
                  <TableHead className="font-semibold">On Hand</TableHead>
                  <TableHead className="font-semibold">Committed</TableHead>
                  <TableHead className="font-semibold">Available</TableHead>
                  <TableHead className="font-semibold">Reorder At</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="stock-table-row">
                    <TableCell className="stock-cell-product">
                      {product.name}
                    </TableCell>
                    <TableCell className="stock-cell-sku">
                      {product.sku}
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.onHand} {product.unit}
                    </TableCell>
                    {/* Zero committed is the ordinary state, so it is
                        muted rather than dashed out — a dash would
                        read as "unknown". */}
                    <TableCell className="text-muted-foreground">
                      {product.committed > 0
                        ? `${product.committed} ${product.unit}`
                        : "—"}
                    </TableCell>
                    {/* The number the allocation decision is made on,
                        so it carries the emphasis. */}
                    <TableCell className="font-semibold">
                      {product.available} {product.unit}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.reorderAt} {product.unit}
                    </TableCell>
                    <TableCell>{renderStatusBadge(product)}</TableCell>
                    <TableCell className="stock-action-cell">
                      <div className="stock-action-group">
                        {canAdjust && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAdjust?.(product)}
                            className="stock-action-btn"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Adjust</span>
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewHistory?.(product)}
                          className="stock-action-btn"
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