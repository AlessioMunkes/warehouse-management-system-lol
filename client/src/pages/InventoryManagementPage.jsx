// ─────────────────────────────────────────────────────────────
// InventoryManagementPage.jsx
// Styled with Ladles of Love Brand Palette & Typography
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
import StockHealthBar from "../features/InventoryManagement/components/StockHealthBar";
import StockManifestTable from "../features/InventoryManagement/components/StockManifestTable";
import AdjustStockModal from "../features/InventoryManagement/components/AdjustStockModal";
import MovementHistory from "../features/InventoryManagement/components/MovementHistory";
import { getManifest, getMovements, adjustStock } from "../services/stockAPI";

const CAN_ADJUST = ["manager", "admin"];

export default function InventoryManagementPage() {
  const { user } = useAuth();

  // Accessibility toggle state for TopNavbar
  const [reducedMovement, setReducedMovement] = useState(false);

  // Manifest & data loading state
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Stock adjustment modal state
  const [isSaving, setIsSaving] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState(null);

  // Movement history drawer state
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

  // ── Adjustment Handler ─────────────────────────────────────
  const handleAdjustSave = async (payload) => {
    setIsSaving(true);
    try {
      await adjustStock(payload);
      await reloadManifest();
      return true;
    } catch (err) {
      alert(err.message || "Failed to save stock adjustment.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // ── Movement History Handler ──────────────────────────────
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
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={setReducedMovement}
      />

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
        <div className="w-full overflow-x-auto rounded-[4px] border border-[#e9e3dd] shadow-sm bg-white">
          <StockManifestTable
            products={products}
            isLoading={isLoading}
            canAdjust={canAdjust}
            onAdjust={(prod) => setAdjustingProduct(prod)}
            onViewHistory={handleViewHistory}
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