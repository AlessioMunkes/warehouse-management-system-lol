// ─────────────────────────────────────────────────────────────
// client/src/pages/PurchaseOrdersPage.jsx
//
// Manager view. App.jsx gates the route and POST /api/purchase-orders
// is requireRole(MANAGER, ADMIN); the useAuth check below is
// belt-and-braces for the same reason SupplierDirectoryPage and
// InventoryManagementPage do it — the route decides who reaches the
// page, the role check decides what the page offers them.
//
// The page shell, the tab strip, the ErrorBanner and the Skeleton
// block are all the SupplierDirectoryPage treatment. That is
// deliberate: it is the closest sibling screen, and a second layout
// for the same kind of work would be a second thing to maintain.
//
// The tab strip is still hand-rolled because there is no tabs.jsx in
// components/ui — SupplierDirectoryPage says the same, and flags that
// the first page to need one should share it. That is now two pages.
// The next one should extract it.
//
// PRODUCTS COME FROM stockAPI.getManifest().
// There is no products endpoint, and the manifest already carries
// name, sku, unit, reorderAt and isLowStock — everything the picker
// and the low-stock seed need. Caveat worth knowing: the manifest is
// built from stock_levels, so a product with no stock_levels row will
// not appear and cannot be ordered. If that bites, the fix belongs in
// the stock repository, not here.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useAuth }   from '../context/AuthContext';
import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import PurchaseOrderForm   from '../features/purchaseOrders/components/PurchaseOrderForm';
import PurchaseOrderList   from '../features/purchaseOrders/components/PurchaseOrderList';
import PurchaseOrderDetail from '../features/purchaseOrders/components/PurchaseOrderDetail';
import purchaseOrderAPI, { PO_STATUS_LABELS } from '../services/purchaseOrderAPI';
import supplierAPI from '../services/supplierAPI';
import stockAPI    from '../services/stockAPI';

import { Button }   from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus }     from 'lucide-react';

const CAN_MANAGE = ['manager', 'admin'];

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'all',  label: 'All' },
];

// Same markup as the global fetch error banner in
// InventoryManagementPage and SupplierDirectoryPage. One error style
// per app.
const ErrorBanner = ({ message, onRetry }) => (
  <div className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    {onRetry ? (
      <button
        onClick={onRetry}
        className="text-xs sm:text-sm font-semibold underline hover:text-[#ef3a40] focus:outline-none"
      >
        Try again
      </button>
    ) : null}
  </div>
);

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [reducedMovement, setReducedMovement] = useState(false);
  const [tab, setTab]           = useState('open');
  const [statusFilter, setStatusFilter] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [mode, setMode]           = useState('list');
  const [isLoading, setLoading]   = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const [formError, setFormError] = useState(null);
  const [invalidProductIds, setInvalidProductIds] = useState([]);

  const loadPurchaseOrders = useCallback(async () => {
    const rows = await purchaseOrderAPI.getPurchaseOrders({ status: statusFilter });
    setPurchaseOrders(rows);
  }, [statusFilter]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // In parallel: three independent reads, and doing them in
      // sequence would show a skeleton for three round trips to
      // Supabase instead of one.
      const [, sups, prods] = await Promise.all([
        loadPurchaseOrders(),
        supplierAPI.getSuppliers(),
        stockAPI.getManifest(),
      ]);
      setSuppliers(sups);
      setProducts(prods);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadPurchaseOrders]);

  useEffect(() => { reload(); }, [reload]);

  const open = async (id) => {
    setError(null);
    try {
      const po = await purchaseOrderAPI.getPurchaseOrder(id);
      setSelected(po);
      setMode('detail');
    } catch (err) { setError(err.message); }
  };

  const create = async (payload) => {
    setBusy(true); setFormError(null); setInvalidProductIds([]);
    try {
      const created = await purchaseOrderAPI.createPurchaseOrder(payload);
      await loadPurchaseOrders();
      // Straight into the new PO rather than back to a list where the
      // manager has to find what she just made.
      await open(created.id);
    } catch (err) {
      setFormError(err.message);
      // The 400 for unconfigured stock codes names the offending rows,
      // so the form marks them instead of clearing thirty lines.
      if (err.missingProductIds) setInvalidProductIds(err.missingProductIds);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setError(null);
    try {
      await purchaseOrderAPI.approvePurchaseOrder(selected.id);
      await loadPurchaseOrders();
      await open(selected.id);
    } catch (err) { setError(err.message); }
  };

  const visible = tab === 'open'
    ? purchaseOrders.filter((po) => po.status !== 'completed' && po.status !== 'returned')
    : purchaseOrders;

  return (
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={() => setReducedMovement((v) => !v)}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium">Purchase orders</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              What we have asked suppliers for, and what has arrived.
            </p>
          </div>
          {canManage && mode !== 'create' ? (
            <Button
              type="button"
              onClick={() => { setMode('create'); setSelected(null); setFormError(null); }}
            >
              <Plus /> New purchase order
            </Button>
          ) : null}
        </div>

        {mode === 'create' ? (
          <div className="mt-6">
            <PurchaseOrderForm
              suppliers={suppliers}
              products={products}
              busy={busy}
              error={formError}
              invalidProductIds={invalidProductIds}
              onSubmit={create}
              onCancel={() => { setMode('list'); setFormError(null); setInvalidProductIds([]); }}
            />
          </div>
        ) : (
          <>
            <div className="mt-5 flex gap-1 border-b">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab(t.id); setSelected(null); setMode('list'); }}
                  className={
                    tab === t.id
                      ? 'border-b-2 border-foreground px-4 py-2 text-sm font-medium'
                      : 'px-4 py-2 text-sm text-muted-foreground'
                  }
                >
                  {t.label}
                </button>
              ))}

              {/* Server-side status filter, separate from the tabs.
                  The tabs are the two views a manager wants by default;
                  this is for chasing one specific state. */}
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setSelected(null); }}
                className="ml-auto mb-1 rounded-[4px] border-2 px-2 py-1 text-sm"
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                {Object.entries(PO_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {error ? (
              <div className="mt-4">
                <ErrorBanner message={error} onRetry={reload} />
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {mode === 'detail' && selected ? (
                  <PurchaseOrderDetail
                    purchaseOrder={selected}
                    canManage={canManage}
                    onApprove={approve}
                    onClose={() => { setSelected(null); setMode('list'); }}
                  />
                ) : null}

                <PurchaseOrderList
                  purchaseOrders={visible}
                  selectedId={selected?.id ?? null}
                  onSelect={open}
                />
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
