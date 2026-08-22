// ─────────────────────────────────────────────────────────────
// StockHealthBar.jsx
//
// Renders stock category health metric cards.
// Supports `reducedMovement` accessibility mode.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Boxes, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

// Custom stylesheet
import "../../../styles/index.css";

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
      if (prod.isShortfall) {
        shortfall += 1;
      } else if (prod.isLowStock) {
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
    <div className="stock-health-wrapper">
      {/* Metric Breakdown Cards Grid */}
      <div className="stock-grid">
        {/* 1. Total SKUs Card */}
        <div className="stock-card">
          <div className="stock-card-header">
            <span className="stock-card-label">Total SKUs</span>
            {!reducedMovement && (
              <Boxes className="stock-icon stock-icon-neutral" />
            )}
          </div>
          <div className="stock-card-body">
            <span className="stock-card-value">{metrics.total}</span>
            <p className="stock-card-subtext stock-text-sub-accessible">
              Active catalog items
            </p>
          </div>
        </div>

        {/* 2. In Stock Card */}
        <div
          className={`stock-card ${
            !reducedMovement ? "stock-card-emerald" : ""
          }`}
        >
          <div className="stock-card-header">
            <span className="stock-card-label">In Stock</span>
            {!reducedMovement && (
              <CheckCircle2 className="stock-icon stock-icon-emerald" />
            )}
          </div>
          <div className="stock-card-body">
            <span className="stock-card-value">{metrics.inStock}</span>
            <p
              className={`stock-card-subtext ${
                reducedMovement
                  ? "stock-text-sub-accessible"
                  : "stock-text-emerald"
              }`}
            >
              {metrics.inStockPct}% of inventory
            </p>
          </div>
        </div>

        {/* 3. Low Stock Card */}
        <div
          className={`stock-card ${
            !reducedMovement ? "stock-card-amber" : ""
          }`}
        >
          <div className="stock-card-header">
            <span className="stock-card-label">Low Stock</span>
            {!reducedMovement && (
              <AlertTriangle className="stock-icon stock-icon-amber" />
            )}
          </div>
          <div className="stock-card-body">
            <span className="stock-card-value">{metrics.lowStock}</span>
            <p
              className={`stock-card-subtext ${
                reducedMovement
                  ? "stock-text-sub-accessible"
                  : "stock-text-amber"
              }`}
            >
              {metrics.lowStockPct}% at or below threshold
            </p>
          </div>
        </div>

        {/* 4. Shortfall Card */}
        <div
          className={`stock-card ${
            !reducedMovement ? "stock-card-rose" : ""
          }`}
        >
          <div className="stock-card-header">
            <span className="stock-card-label">Shortfall</span>
            {!reducedMovement && (
              <XCircle className="stock-icon stock-icon-rose" />
            )}
          </div>
          <div className="stock-card-body">
            <span className="stock-card-value">{metrics.shortfall}</span>
            <p
              className={`stock-card-subtext ${
                reducedMovement
                  ? "stock-text-sub-accessible"
                  : "stock-text-rose"
              }`}
            >
              {metrics.shortfallPct}% over-committed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}