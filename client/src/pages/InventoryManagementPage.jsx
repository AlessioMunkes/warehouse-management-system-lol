// ─────────────────────────────────────────────────────────────
// InventoryManagementPage.jsx
// Styled with Ladles of Love Brand Palette & Typography
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from '../features/taskdashboard/components/shellContext';
import { useAuth } from "../context/AuthContext";
import StockHealthBar from "../features/InventoryManagement/components/StockHealthBar";
import StockManifestTable from "../features/InventoryManagement/components/StockManifestTable";
import AdjustStockModal from "../features/InventoryManagement/components/AdjustStockModal";
import MovementHistory from "../features/InventoryManagement/components/MovementHistory";
import StockItemSummary from "../features/InventoryManagement/components/StockItemSummary";
import { getManifest, getMovements, adjustStock, getStockTrends } from "../services/stockAPI";
import { useToast } from "@/components/ui/toastContext";

const CAN_ADJUST = ["manager", "admin"];

export default function InventoryManagementPage() {
  const { user } = useAuth();

  // Accessibility toggle state for TopNavbar
  const { reducedMotion: reducedMovement } = useReducedMotion();

  // Manifest & data loading state
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Stock adjustment modal state
  const [isSaving, setIsSaving] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState(null);

  // 30-day sparkline series, keyed by product id. Loaded alongside
  // the manifest but never blocking it: a failure here costs one
  // column, and the stock numbers are the reason the page exists.
  const [trends, setTrends] = useState({});

  const toast = useToast();

  // Movement history drawer state
  // The summary panel. It borrows the same movement fetch the history
  // drawer uses rather than adding a second one — same endpoint, same
  // product, and two in-flight copies of one list is how they end up
  // disagreeing.
  const [summaryFor, setSummaryFor] = useState(null);
  const [summaryMovements, setSummaryMovements] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const canAdjust = CAN_ADJUST.includes(user?.role);

  // ── Initial Data Load ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadManifest = async () => {
      try {
        const rows = await getManifest();
        if (!cancelled) {
          setProducts(rows);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || "Could not load stock levels.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadManifest();

    // Deliberately not awaited with the manifest and deliberately
    // swallowing its error: the sparkline column degrades to dashes
    // if this fails, which is a smaller loss than a blank screen.
    getStockTrends(30)
      .then((series) => { if (!cancelled) setTrends(series); })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Reload Manifest Data ───────────────────────────────────
  const reloadManifest = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await getManifest();
      setProducts(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "Could not load stock levels.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Undo ───────────────────────────────────────────────────
  // Posts the inverse delta. It does NOT delete the original
  // movement, and it must not: stock_movements is the audit trail
  // the reconciliation screen balances against, and a ledger you can
  // quietly edit is not a ledger. The reversal is its own row, with a
  // reason that says what it reverses.
  //
  // The reason is prefixed rather than reused, which also keeps the
  // movement type honest — "Undo of: Spillage" does not match the
  // WASTAGE_REASONS list in stock.repository.js, so undoing a wastage
  // entry is filed as an adjustment. Reversing a loss is not itself
  // a loss.
  const undoAdjustment = async (payload, productName) => {
    try {
      await adjustStock({
        productId:     payload.productId,
        quantityDelta: -Number(payload.quantityDelta),
        unit:          payload.unit,
        reason:        `Undo of: ${payload.reason}`,
      });
      await reloadManifest();
      toast({
        variant: "success",
        title: `Reversed the adjustment to ${productName}`,
        description: "The reversal is recorded as its own movement — the original entry stays in the ledger.",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not undo that adjustment",
        description: err.message || "The original adjustment is unchanged.",
      });
    }
  };

  // ── Adjustment Handler ─────────────────────────────────────
  const handleAdjustSave = async (payload) => {
    setIsSaving(true);
    try {
      await adjustStock(payload);
      await reloadManifest();

      // Read the name before the modal closes and clears it.
      const product = products.find((p) => p.id === payload.productId);
      const name    = product?.name ?? "this product";
      const delta   = Number(payload.quantityDelta);
      const unit    = payload.unit || product?.unit || "";

      toast({
        variant: "success",
        title: `${delta < 0 ? "Removed" : "Added"} ${Math.abs(delta)} ${unit} — ${name}`.trim(),
        description: payload.reason,
        action: { label: "Undo", onClick: () => undoAdjustment(payload, name) },
      });
      return true;
    } catch (err) {
      // Was window.alert(), which blocks the whole tab and cannot be
      // read by anything assistive.
      toast({
        variant: "error",
        title: "Could not save that adjustment",
        description: err.message || "Nothing was changed.",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // ── Movement History Handler ──────────────────────────────
  const handleOpenSummary = async (product) => {
    setSummaryFor(product);
    setSummaryMovements([]);
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      setSummaryMovements(await getMovements(product.id));
    } catch (err) {
      // The panel still shows every figure and every catalogue fact —
      // only the chart is missing — so this reports itself in place
      // rather than closing the panel or blanking it.
      setSummaryError(err.message || "Could not load the movement history for this product.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleViewHistory = async (product) => {
    setHistoryFor(product);
    setMovements([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const history = await getMovements(product.id);
      setMovements(history);
    } catch (err) {
      setHistoryError(err.message || "Could not load movement history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#2b3336] font-['Montserrat',sans-serif] flex flex-col">
      {/* 1. App Top Navigation Bar Header */}

      {/* 2. Main Content Container (Bounded at max-w-6xl for scannability) */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8 flex-1">
        
        {/* Page Heading Banner with Brand Accent Bar */}
        <div className="border-l-4 border-[#ef3a40] pl-4 py-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2b3336]">
            Inventory Management
          </h1>
          <p className="text-xs sm:text-sm text-[#676767] mt-1 font-normal">
            Real-time stock manifest, manual distribution adjustments, and audit trail logs.
          </p>
        </div>

        {/* Global Fetch Error Banner */}
        {loadError && (
          <div className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <span>{loadError}</span>
            <button
              onClick={reloadManifest}
              className="text-xs sm:text-sm font-semibold underline hover:text-[#ef3a40] focus:outline-none"
            >
              Try again
            </button>
          </div>
        )}

        {/* 3. Stock Health Summary Cards (Passes reducedMovement) */}
        <StockHealthBar products={products} reducedMovement={reducedMovement} />

        {/* 4. Stock Manifest Data Table */}
        {/* No overflow-x-auto: the table is fixed-layout and fits its
            container now, so a scroll region here would only ever hide
            a regression rather than absorb one. */}
        <div className="w-full rounded-[4px] border border-[#e9e3dd] shadow-sm bg-white">
          <StockManifestTable
            products={products}
            isLoading={isLoading}
            canAdjust={canAdjust}
            trends={trends}
            onAdjust={(prod) => setAdjustingProduct(prod)}
            onViewHistory={handleViewHistory}
            onOpenSummary={handleOpenSummary}
          />
        </div>
      </main>

      {/* Single Product Stock Adjustment Modal */}
      {adjustingProduct && (
        <AdjustStockModal
          product={adjustingProduct}
          onSave={handleAdjustSave}
          onClose={() => setAdjustingProduct(null)}
          isSaving={isSaving}
        />
      )}

      {/* Item summary — what the row was pointing at all along */}
      {summaryFor && (
        <StockItemSummary
          product={summaryFor}
          movements={summaryMovements}
          isLoading={summaryLoading}
          error={summaryError}
          canAdjust={canAdjust}
          canEditCatalogue={user?.role === 'admin'}
          onAdjust={(p) => { setSummaryFor(null); setAdjustingProduct(p); }}
          onViewHistory={(p) => { setSummaryFor(null); handleViewHistory(p); }}
          onClose={() => setSummaryFor(null)}
        />
      )}

      {/* Movement History Drawer */}
      {historyFor && (
        <MovementHistory
          product={historyFor}
          movements={movements}
          isLoading={historyLoading}
          error={historyError}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}