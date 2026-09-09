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
  Columns3,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";

import "../../../styles/landingpage.css";

// ── Columns ──────────────────────────────────────────────────
// One definition drives the header, the body and the Columns menu, so
// hiding a column cannot leave its cells behind.
//
// `width` is a percentage because the table is fixed-layout: eight
// auto-width columns plus a full product name is what forced the
// horizontal scroll. Fixed layout means the browser honours these
// instead of widening to fit the longest cell.
//
// `sort` is the value a row sorts on. Product and SKU sort as text,
// everything else numerically — sorting "12" against "9" as strings is
// how a stock table ends up claiming 9 is more than 12.
const COLUMNS = [
  { key: 'name',      label: 'Product',   width: '26%', align: 'left',
    sort: (p) => (p.name ?? '').toLowerCase() },
  { key: 'sku',       label: 'SKU',       width: '14%', align: 'left',
    sort: (p) => (p.sku ?? '').toLowerCase() },
  { key: 'onHand',    label: 'On Hand',   width: '10%', align: 'right',
    sort: (p) => Number(p.onHand ?? 0) },
  { key: 'committed', label: 'Committed', width: '10%', align: 'right',
    sort: (p) => Number(p.committed ?? 0) },
  { key: 'available', label: 'Available', width: '10%', align: 'right',
    sort: (p) => Number(p.available ?? 0) },
  { key: 'reorderAt', label: 'Reorder At',width: '10%', align: 'right',
    sort: (p) => Number(p.reorderAt ?? 0) },
  { key: 'status',    label: 'Status',    width: '10%', align: 'left',
    // Shortfall first, then low stock, then healthy — the order someone
    // scanning for problems wants, not alphabetical.
    sort: (p) => (p.isShortfall ? 2 : p.isLowStock ? 1 : 0) },
  { key: 'actions',   label: 'Actions',   width: '10%', align: 'right',
    sort: null },
];

const COLUMN_KEY = 'wms_stock_columns';

const readStoredColumns = () => {
  try {
    const raw = localStorage.getItem(COLUMN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

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

  // Which columns are on. Remembered per device: someone who works from
  // the shortfall list every morning should not re-hide four columns
  // each time they open the page.
  const [visibleKeys, setVisibleKeys] = useState(
    () => readStoredColumns() ?? COLUMNS.map((c) => c.key)
  );

  // null = the order the server sent, which is alphabetical by name.
  const [sort, setSort] = useState(null); // { key, direction }

  const setColumnVisible = (key, on) => {
    setVisibleKeys((previous) => {
      const next = on
        ? [...new Set([...previous, key])]
        : previous.filter((k) => k !== key);
      try { localStorage.setItem(COLUMN_KEY, JSON.stringify(next)); } catch { /* nothing we can do */ }
      return next;
    });
  };

  // Highest first on the first click. On a stock table the interesting
  // rows are the big numbers and the shortfalls, so ascending first
  // would mean everyone clicks twice, every time.
  const toggleSort = (key) => {
    setSort((previous) => {
      if (!previous || previous.key !== key) return { key, direction: 'desc' };
      if (previous.direction === 'desc') return { key, direction: 'asc' };
      return null;   // third click returns to the server's order
    });
  };

  const columns = COLUMNS.filter((c) => visibleKeys.includes(c.key));

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

  // Applied after filtering, so the two compose: filters decide which
  // rows, sort decides their order. localeCompare for text so 'Éclair'
  // files next to 'Eclair' rather than after 'Zucchini'.
  const sortedProducts = useMemo(() => {
    if (!sort) return filteredProducts;
    const column = COLUMNS.find((c) => c.key === sort.key);
    if (!column?.sort) return filteredProducts;

    const factor = sort.direction === 'desc' ? -1 : 1;
    return [...filteredProducts].sort((a, b) => {
      const left = column.sort(a);
      const right = column.sort(b);
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right), 'en-ZA') * factor;
      }
      return (left - right) * factor;
    });
  }, [filteredProducts, sort]);

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
            {/* Columns. Hiding one is per-device and remembered, which
                is what makes the table usable on a laptop without
                dropping the columns a desk user needs. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="stock-filter-btn">
                  <Columns3 className="h-3.5 w-3.5" />
                  <span>Columns</span>
                  {visibleKeys.length < COLUMNS.length && (
                    <span className="stock-filter-count">
                      {COLUMNS.length - visibleKeys.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Show columns
                </h4>
                <div className="flex flex-col gap-2">
                  {COLUMNS.map((c) => {
                    const on = visibleKeys.includes(c.key);
                    // Never let the last one go: an empty table is not a
                    // view anyone asked for.
                    const isLast = on && visibleKeys.length === 1;
                    return (
                      <label key={c.key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={on}
                          disabled={isLast}
                          onCheckedChange={(checked) => setColumnVisible(c.key, checked === true)}
                        />
                        <span>{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

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
            <Table className="w-full table-fixed">
              <colgroup>
                {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
              </colgroup>
              <TableHeader className="stock-table-header">
                <TableRow>
                  {columns.map((c) => (
                    <TableHead
                      key={c.key}
                      className={`font-semibold ${c.align === 'right' ? 'text-right' : ''}`}
                    >
                      {c.sort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          aria-label={`Sort by ${c.label}`}
                          className={`inline-flex items-center gap-1 hover:text-[#2b3336] ${
                            c.align === 'right' ? 'flex-row-reverse' : ''
                          }`}
                        >
                          <span>{c.label}</span>
                          {sort?.key === c.key
                            ? (sort.direction === 'desc'
                                ? <ArrowDown className="h-3 w-3" />
                                : <ArrowUp className="h-3 w-3" />)
                            : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
                        </button>
                      ) : c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProducts.map((product) => (
                  <TableRow key={product.id} className="stock-table-row">
                    {columns.map((c) => {
                      // truncate + title: fixed layout means a long
                      // product name would otherwise be clipped with no
                      // way to read it. The tooltip is the full value.
                      if (c.key === 'name') return (
                        <TableCell key={c.key} className="stock-cell-product truncate" title={product.name}>
                          {product.name}
                        </TableCell>
                      );
                      if (c.key === 'sku') return (
                        <TableCell key={c.key} className="stock-cell-sku truncate" title={product.sku}>
                          {product.sku}
                        </TableCell>
                      );
                      if (c.key === 'onHand') return (
                        <TableCell key={c.key} className="text-right font-medium">
                          {product.onHand} {product.unit}
                        </TableCell>
                      );
                      // Zero committed is the ordinary state, so it is
                      // muted rather than dashed out — a dash would
                      // read as "unknown".
                      if (c.key === 'committed') return (
                        <TableCell key={c.key} className="text-right text-muted-foreground">
                          {product.committed > 0 ? `${product.committed} ${product.unit}` : "—"}
                        </TableCell>
                      );
                      // The number the allocation decision is made on,
                      // so it carries the emphasis.
                      if (c.key === 'available') return (
                        <TableCell key={c.key} className="text-right font-semibold">
                          {product.available} {product.unit}
                        </TableCell>
                      );
                      if (c.key === 'reorderAt') return (
                        <TableCell key={c.key} className="text-right text-muted-foreground">
                          {product.reorderAt} {product.unit}
                        </TableCell>
                      );
                      if (c.key === 'status') return (
                        <TableCell key={c.key}>{renderStatusBadge(product)}</TableCell>
                      );
                      return (
                        <TableCell key={c.key} className="stock-action-cell">
                          <div className="stock-action-group">
                            {canAdjust && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onAdjust?.(product)}
                                className="stock-action-btn"
                                aria-label={`Adjust ${product.name}`}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                {/* Label hidden on narrow viewports —
                                    two labelled buttons is what pushed
                                    the last column off screen. */}
                                <span className="hidden xl:inline">Adjust</span>
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onViewHistory?.(product)}
                              className="stock-action-btn"
                              aria-label={`History for ${product.name}`}
                            >
                              <History className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">History</span>
                            </Button>
                          </div>
                        </TableCell>
                      );
                    })}
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