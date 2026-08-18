// ─────────────────────────────────────────────────────────────
// InventoryManagementPage.jsx
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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar Header */}
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={setReducedMovement}
      />

      {/* Main Content Container with max-w-6xl for optimal readability */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8 flex-1">
        
        {/* Responsive Page Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Inventory Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Current stock levels, manual adjustments, and audit trail logs.
          </p>
        </div>

        {/* Fetch Error Banner */}
        {loadError && (
          <div className="p-3 sm:p-4 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
            <span>{loadError}</span>
            <button
              onClick={reloadManifest}
              className="text-xs sm:text-sm font-semibold underline hover:no-underline self-start sm:self-auto focus:outline-none"
            >
              Try again
            </button>
          </div>
        )}

        {/* Stock Health Bar (Responsive Grid inside component) */}
        <StockHealthBar products={products}  reducedMovement={reducedMovement}/>

        {/* Stock Manifest Table with horizontal scroll container for mobile */}
        <div className="w-full overflow-x-auto">
          <StockManifestTable
            products={products}
            isLoading={isLoading}
            canAdjust={canAdjust}
            onAdjust={(prod) => setAdjustingProduct(prod)}
            onViewHistory={handleViewHistory}
          />
        </div>
      </main>

      {/* Adjustment Modal */}
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