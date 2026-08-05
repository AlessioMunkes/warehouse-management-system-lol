// ─────────────────────────────────────────────────────────────
// InventoryManagementPage.jsx
//
// The page previously took `products`, `onAdjust` and `onLogout` as
// props, but App.jsx renders it with none — so the manifest was
// permanently empty, adjustments only touched local state and were
// lost on refresh, and the logout button threw. It now owns its own
// data and reads the session from context, like every other page.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../features/InventoryManagement/components/PageHeader";
import SectionHeader from "../features/InventoryManagement/components/SectionHeader";
import StockManifestTable from "../features/InventoryManagement/components/StockManifestTable";
import AdjustStockForm from "../features/InventoryManagement/components/AdjustStockForm";
import MovementHistory from "../features/InventoryManagement/components/MovementHistory";
import InfoNotice from "../features/InventoryManagement/components/InfoNotice";
import { getManifest, getMovements, adjustStock } from "../services/stockAPI";

// POST /api/stock/adjust is gated to manager/admin server-side
// (MANAGERS_UP in stock.routes.js). Hiding the form for everyone
// else keeps a worker from filling it in only to be refused.
const CAN_ADJUST = ["manager", "admin"];

// TEMPORARY: .programme-select-heading isn't rendering on this page
// (stylesheet import issue still being tracked down), so the heading
// is styled inline here as a stopgap. Scoped to Inventory only via
// SectionHeader's inlineHeadingStyle prop — Procurement and any other
// SectionHeader usage are unaffected. Remove once the CSS import is
// fixed and swap back to className="programme-select-heading".
const INVENTORY_HEADING_STYLE = {
  fontFamily: "'Poppins', var(--font-family-sans)",
  fontSize: "32px",
  fontWeight: 700,
  color: "black",
  marginBottom: "8px",
};

export default function InventoryManagementPage() {
  const { user, logout } = useAuth();

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }

  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const canAdjust = CAN_ADJUST.includes(user?.role);

  // ── Initial load ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadManifest = async () => {
      try {
        const rows = await getManifest();
        if (!cancelled) { setProducts(rows); setLoadError(null); }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Could not load stock levels.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadManifest();
    return () => { cancelled = true; };
  }, []);

  // ── Manual refresh — retry button, and after a saved adjustment ──
  const reloadManifest = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await getManifest());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "Could not load stock levels.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Save an adjustment ──────────────────────────────────────
  const handleAdjust = async (payload) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await adjustStock(payload);
      await reloadManifest();

      const warnings = [];
      if (result?.isShortfall) {
        warnings.push(`This leaves ${result.after} on hand — the system now shows a shortfall.`);
      }
      if (result?.isUnitMismatch) {
        warnings.push("The unit sent didn't match the unit on record; the recorded unit was kept.");
      }

      setNotice(
        warnings.length
          ? { tone: "warning", text: `Adjustment saved. ${warnings.join(" ")}` }
          : { tone: "info", text: `Adjustment saved. New level: ${result?.after}.` }
      );
      return true;
    } catch (err) {
      setNotice({ tone: "error", text: err.message || "Could not save the adjustment." });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // ── Drill in to one product's ledger ────────────────────────
  const handleViewHistory = async (product) => {
    setHistoryFor(product);
    setMovements([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      setMovements(await getMovements(product.id));
    } catch (err) {
      setHistoryError(err.message || "Could not load movement history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="page-light">
      <PageHeader onLogout={logout} showBack={true} />

      <main className="decanting-content">
        <SectionHeader
          title="Inventory Management"
          subtitle="Current stock levels and manual adjustments."
          inlineHeadingStyle={INVENTORY_HEADING_STYLE}
        />

        {loadError && (
          <InfoNotice tone="error">
            {loadError} <button className="btn-link" onClick={reloadManifest}>Try again</button>
          </InfoNotice>
        )}

        {notice && <InfoNotice tone={notice.tone}>{notice.text}</InfoNotice>}

        <StockManifestTable
          products={products}
          isLoading={isLoading}
          onViewHistory={handleViewHistory}
        />

        {canAdjust && (
          <AdjustStockForm
            products={products}
            onSave={handleAdjust}
            isSaving={isSaving}
          />
        )}
      </main>

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