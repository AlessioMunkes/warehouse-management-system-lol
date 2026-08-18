// ─────────────────────────────────────────────────────────────
// StockHealthBar.jsx
//
// Renders stock category health summaries and metric cards.
// Supports `reducedMovement` accessibility mode:
// - When active: Suppresses status icons, indicator dots, and vivid colors.
// - When inactive: Displays color-coded badges, status dots, and icons.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Boxes, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export default function StockHealthBar({ products = [], reducedMovement = false }) {
  // Compute inventory category counts and percentages
  const metrics = useMemo(() => {
    const total = products.length;
    if (total === 0) {
      return {
        total: 0,
        inStock: 0,
        lowStock: 0,
        shortfall: 0,
        inStockPct: 0,
        lowStockPct: 0,
        shortfallPct: 0,
      };
    }

    let inStock = 0;
    let lowStock = 0;
    let shortfall = 0;

    products.forEach((prod) => {
      const qty = prod.quantity ?? 0;
      const min = prod.minThreshold ?? prod.reorderLevel ?? 10;

      if (qty === 0) {
        shortfall += 1;
      } else if (qty <= min) {
        lowStock += 1;
      } else {
        inStock += 1;
      }
    });

    return {
      total,
      inStock,
      lowStock,
      shortfall,
      inStockPct: Math.round((inStock / total) * 100),
      lowStockPct: Math.round((lowStock / total) * 100),
      shortfallPct: Math.round((shortfall / total) * 100),
    };
  }, [products]);

  return (
    <div className="space-y-4">
      {/* Top Banner / Distribution Status Bar */}
      <div className="p-4 sm:p-5 rounded-xl border bg-card text-card-foreground shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Overall Stock Health</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Real-time overview of active SKUs across status categories.
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
            {metrics.total} Total SKUs
          </span>
        </div>

        {/* Status Category Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-medium pt-1">
          <div className="flex items-center gap-1.5">
            {!reducedMovement && (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            )}
            <span className={reducedMovement ? "text-foreground" : "text-emerald-700 dark:text-emerald-400"}>
              In Stock: {metrics.inStock} ({metrics.inStockPct}%)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {!reducedMovement && (
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            )}
            <span className={reducedMovement ? "text-foreground" : "text-amber-700 dark:text-amber-400"}>
              Low Stock: {metrics.lowStock} ({metrics.lowStockPct}%)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {!reducedMovement && (
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            )}
            <span className={reducedMovement ? "text-foreground" : "text-rose-700 dark:text-rose-400"}>
              Shortfall: {metrics.shortfall} ({metrics.shortfallPct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Metric Breakdown Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* 1. Total SKUs Card */}
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              Total SKUs
            </span>
            {!reducedMovement && (
              <Boxes className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight">
              {metrics.total}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Active catalog items
            </p>
          </div>
        </div>

        {/* 2. In Stock Card */}
        <div
          className={`p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col justify-between transition-colors ${
            reducedMovement
              ? "border-border"
              : "border-l-4 border-l-emerald-500"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              In Stock
            </span>
            {!reducedMovement && (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            )}
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight">
              {metrics.inStock}
            </span>
            <p
              className={`text-xs mt-1 font-medium ${
                reducedMovement
                  ? "text-muted-foreground"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {metrics.inStockPct}% of inventory
            </p>
          </div>
        </div>

        {/* 3. Low Stock Card */}
        <div
          className={`p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col justify-between transition-colors ${
            reducedMovement
              ? "border-border"
              : "border-l-4 border-l-amber-500"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              Low Stock
            </span>
            {!reducedMovement && (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight">
              {metrics.lowStock}
            </span>
            <p
              className={`text-xs mt-1 font-medium ${
                reducedMovement
                  ? "text-muted-foreground"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {metrics.lowStockPct}% below threshold
            </p>
          </div>
        </div>

        {/* 4. Shortfall Card */}
        <div
          className={`p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col justify-between transition-colors ${
            reducedMovement
              ? "border-border"
              : "border-l-4 border-l-rose-500"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              Shortfall
            </span>
            {!reducedMovement && (
              <XCircle className="h-5 w-5 text-rose-600" />
            )}
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight">
              {metrics.shortfall}
            </span>
            <p
              className={`text-xs mt-1 font-medium ${
                reducedMovement
                  ? "text-muted-foreground"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {metrics.shortfallPct}% deficit
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}