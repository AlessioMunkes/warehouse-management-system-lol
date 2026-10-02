// ─────────────────────────────────────────────────────────────
// InventoryManagementPage.jsx
//
// The manager's stock list, laid out the way every manager list now
// is (Feed the Soil's pattern): title and one line of what this is,
// view tabs with counts, a toolbar, the table, and a panel down the
// right for one product.
//
// The current tab lives in the URL as ?status=<view id>, so the
// dashboard's low-stock tile and the low-stock notification — which
// both link to ?status=lowstock — land on the right tab, and a tab
// survives a refresh.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ViewTabs from "@/components/ui/view-tabs";
import PageHeader, { PageShell } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import ProductPickerDialog from "../features/InventoryManagement/components/ProductPickerDialog";
import StockManifestTable from "../features/InventoryManagement/components/StockManifestTable";
import StockDetailPanel from "../features/InventoryManagement/components/StockDetailPanel";
import AdjustStockModal from "../features/InventoryManagement/components/AdjustStockModal";
import { VIEWS, countViews, viewById } from "../features/InventoryManagement/inventoryViews";
import { getManifest, adjustStock } from "../services/stockAPI";
import { STAFF } from "../routes/paths";
import { useToast } from "@/components/ui/toastContext";

// Manual adjustment rewrites the ledger; raising an order commits
// money. Both are manager and admin, matching the server's routes.
const CAN_ADJUST = ["manager", "admin"];
const CAN_ORDER  = ["manager", "admin"];

const ErrorBanner = ({ message, onRetry }) => (
  <div className="p-4 rounded-[4px] bg-danger-soft border-2 border-brand text-ink text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    <button onClick={onRetry} className="text-xs sm:text-sm font-semibold underline hover:text-brand focus:outline-none">
      Try again
    </button>
  </div>
);

export default function InventoryManagementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewById(searchParams.get("status")).id;

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // The product whose panel is open, by id so a reload of the manifest
  // shows its new figures rather than the ones it was opened with.
  const [openId, setOpenId] = useState(null);

  // Products waiting to be adjusted, first one showing. One product is
  // a queue of one; ticking several and choosing Adjust stock walks
  // through them.
  const [adjustQueue, setAdjustQueue] = useState([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  // "+ Adjust stock" in the header: which product, first.
  const [picking, setPicking] = useState(false);

  const toast = useToast();
  const canAdjust = CAN_ADJUST.includes(user?.role);
  const canOrder  = CAN_ORDER.includes(user?.role);

  const counts = useMemo(() => countViews(products), [products]);
  const openProduct = products.find((p) => p.id === openId) ?? null;

  // ── Data ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getManifest()
      .then((rows) => { if (!cancelled) { setProducts(rows); setLoadError(null); } })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Could not load stock levels."); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

  const changeView = (id) => {
    setSearchParams(id === "all" ? {} : { status: id }, { replace: true });
  };

  // ── Adjusting ──────────────────────────────────────────────
  const startAdjusting = (list) => {
    setOpenId(null);
    setAdjustQueue(list);
    setQueueTotal(list.length);
  };
  const nextInQueue = () => setAdjustQueue((q) => q.slice(1));
  const stopAdjusting = () => { setAdjustQueue([]); setQueueTotal(0); };

  // Undo posts the inverse delta. It does NOT delete the original
  // movement, and it must not: stock_movements is the audit trail the
  // reconciliation screen balances against, and a ledger you can
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
        description: "The reversal is recorded as its own movement. The original entry stays in the ledger.",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not undo that adjustment",
        description: err.message || "The original adjustment is unchanged.",
      });
    }
  };

  const handleAdjustSave = async (payload) => {
    setIsSaving(true);
    try {
      await adjustStock(payload);
      await reloadManifest();

      const product = products.find((p) => p.id === payload.productId);
      const name    = product?.name ?? "this product";
      const delta   = Number(payload.quantityDelta);
      const unit    = payload.unit || product?.unit || "";

      toast({
        variant: "success",
        title: `${delta < 0 ? "Removed" : "Added"} ${Math.abs(delta)} ${unit} of ${name}`.trim(),
        description: payload.reason,
        action: { label: "Undo", onClick: () => undoAdjustment(payload, name) },
      });
      return true;
    } catch (err) {
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

  // ── Ordering ───────────────────────────────────────────────
  // The purchase-order form seeds a line per product, with the
  // shortfall to the reorder level as a suggested quantity.
  const raisePurchaseOrder = (list) => {
    navigate(`${STAFF.purchaseOrders}?products=${list.map((p) => p.id).join(",")}`);
  };

  const adjusting = adjustQueue[0] ?? null;

  return (
    <PageShell>
      <PageHeader
        title="Inventory"
        description="What is in the building, what is promised to a pallet, and what is still free to allocate."
        actions={canAdjust ? (
          <Button type="button" onClick={() => setPicking(true)} disabled={isLoading || products.length === 0}>
            <Plus /> Adjust stock
          </Button>
        ) : null}
      />

      {loadError ? <div className="mt-4"><ErrorBanner message={loadError} onRetry={reloadManifest} /></div> : null}

      <ViewTabs
        className="mt-5"
        label="Stock views"
        value={view}
        onChange={changeView}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <StockManifestTable
          products={products}
          view={view}
          isLoading={isLoading}
          canAdjust={canAdjust}
          canOrder={canOrder}
          onOpen={(p) => setOpenId(p.id)}
          onBulkAdjust={startAdjusting}
          onRaisePurchaseOrder={raisePurchaseOrder}
        />
      </div>

      {openProduct ? (
        <StockDetailPanel
          key={openProduct.id}
          product={openProduct}
          canAdjust={canAdjust}
          canEditCatalogue={user?.role === "admin"}
          onAdjust={(p) => startAdjusting([p])}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {picking ? (
        <ProductPickerDialog
          products={products}
          title="Adjust stock"
          description="Which product?"
          onPick={(p) => { setPicking(false); startAdjusting([p]); }}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {adjusting ? (
        <AdjustStockModal
          // A fresh form for each product in a run, not the last one's
          // quantity and reason carried over.
          key={adjusting.id}
          product={adjusting}
          onSave={handleAdjustSave}
          onClose={nextInQueue}
          isSaving={isSaving}
          queue={queueTotal > 1 ? {
            position: queueTotal - adjustQueue.length + 1,
            total: queueTotal,
            onStop: stopAdjusting,
          } : null}
        />
      ) : null}
    </PageShell>
  );
}
