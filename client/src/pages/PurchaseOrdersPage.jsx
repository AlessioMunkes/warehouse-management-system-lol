// ─────────────────────────────────────────────────────────────
// client/src/pages/PurchaseOrdersPage.jsx
//
// Manager view, on the shared list pattern (Inventory's): title, view
// tabs with counts, toolbar, table, and the order in a panel down the
// right. Raising or editing an order replaces the list with the form —
// it is too long for a panel.
//
// App.jsx gates the route and POST /api/purchase-orders is
// requireRole(MANAGER, ADMIN); the role check below decides what the
// page offers, the route decides who reaches it.
//
// TABS COUNT WHAT WAS FETCHED
// The list asks for up to 500 orders (the server's default is 50) and
// the tabs filter and count that, so a tab's number is the rows it
// shows. A warehouse that ever has more than 500 orders on the books
// will want server-side paging here.
//
// URL
//   ?status=<tab>     the tab (the dashboard's Needs attention links)
//   ?id=<id>          open that order (notifications)
//   ?products=1,2,3   start a new order with these lines (Inventory's
//                     bulk "Raise purchase order")
//
// PRODUCTS COME FROM stockAPI.getManifest().
// There is no products endpoint, and the manifest already carries
// name, sku, unit, reorderAt and isLowStock — everything the picker
// and the low-stock seed need. A product with no stock_levels row will
// not appear and cannot be ordered; the fix for that belongs in the
// stock repository, not here.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth }   from '../context/AuthContext';
import PurchaseOrderForm   from '../features/purchaseOrders/components/PurchaseOrderForm';
import PurchaseOrderList   from '../features/purchaseOrders/components/PurchaseOrderList';
import PurchaseOrderDetail from '../features/purchaseOrders/components/PurchaseOrderDetail';
import purchaseOrderAPI, { PO_STATUS_LABELS } from '../services/purchaseOrderAPI';
import supplierAPI from '../services/supplierAPI';
import stockAPI    from '../services/stockAPI';
import { Button }   from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ViewTabs from '@/components/ui/view-tabs';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ListCard from '@/components/ui/list-card';
import ErrorBanner from '@/components/ui/error-banner';
import ListToolbar from '@/components/ui/list-toolbar';
import { useToast } from '@/components/ui/toastContext';
import { Plus, Link2 } from 'lucide-react';
import QuickbooksImportDialog from '../features/purchaseOrders/components/QuickbooksImportDialog';
import useTableView from '../features/masterdata/hooks/useTableView';
import useOpenFromQuery from '../features/masterdata/hooks/useOpenFromQuery';
import { PO_COLUMNS } from '../features/purchaseOrders/components/poColumns';
import { downloadCsv, toCsv } from '../features/reporting/chartFormat';

const CAN_MANAGE = ['manager', 'admin'];
const LIST_LIMIT = 500;

// `id` is what goes in ?status=. The ids that are statuses are the
// status itself, so the dashboard links read plainly.
const PO_VIEWS = [
  { id: 'open',               label: 'Open',
    test: (po) => po.status !== 'completed' && po.status !== 'returned' },
  { id: 'pending',            label: 'Awaiting approval', alert: true, test: (po) => po.status === 'pending' },
  { id: 'in_transit',         label: 'In transit',         test: (po) => po.status === 'in_transit' },
  { id: 'follow_up_required', label: 'Follow-up required', alert: true, test: (po) => po.status === 'follow_up_required' },
  { id: 'all',                label: 'All',                test: () => true },
];
const viewById = (id) => PO_VIEWS.find((v) => v.id === id) ?? PO_VIEWS[0];

const EXPORT_COLUMNS = [
  { key: 'poNumber', label: 'PO number' },
  { key: 'supplierName', label: 'Supplier' },
  { key: 'statusLabel', label: 'Status' },
  { key: 'expectedDeliveryDate', label: 'Expected' },
  { key: 'receivedLineCount', label: 'Lines received' },
  { key: 'lineCount', label: 'Lines' },
  { key: 'estimatedValue', label: 'Estimated (R)' },
];

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = CAN_MANAGE.includes(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewById(searchParams.get('status')).id;

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [mode, setMode]           = useState('list');   // list | create | edit
  const [isLoading, setLoading]   = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const [formError, setFormError] = useState(null);
  const [invalidProductIds, setInvalidProductIds] = useState([]);
  const [search, setSearch]       = useState('');
  const [importOpen, setImportOpen] = useState(false);

  // Sorting and column visibility, from the hook every other table in
  // the app reads.
  const tableView = useTableView('purchaseOrders', PO_COLUMNS);

  const loadPurchaseOrders = useCallback(async () => {
    setPurchaseOrders(await purchaseOrderAPI.getPurchaseOrders({ limit: LIST_LIMIT }));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
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

  useEffect(() => {
    let cancelled = false;
    // In parallel: three independent reads, so one skeleton for one
    // round trip rather than three.
    Promise.all([
      purchaseOrderAPI.getPurchaseOrders({ limit: LIST_LIMIT }),
      supplierAPI.getSuppliers(),
      stockAPI.getManifest(),
    ])
      .then(([pos, sups, prods]) => {
        if (cancelled) return;
        setPurchaseOrders(pos);
        setSuppliers(sups);
        setProducts(prods);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const open = useCallback(async (id) => {
    setError(null);
    try {
      setSelected(await purchaseOrderAPI.getPurchaseOrder(id));
      setMode('list');
    } catch (err) { setError(err.message); }
  }, []);
  useOpenFromQuery(open, { param: 'id' });

  // ?products=1,2,3 — the inventory screen's bulk "Raise purchase
  // order". Opens a new order with a line per product once the
  // manifest has loaded (the lines need its reorder levels and costs).
  // The parameter is then dropped, so a refresh or a later Cancel does
  // not reopen the same draft.
  const [seedProducts, setSeedProducts] = useState([]);
  const [seededFrom, setSeededFrom] = useState(null);
  const productsParam = searchParams.get('products');
  if (productsParam && productsParam !== seededFrom && canManage && products.length) {
    const ids = new Set(productsParam.split(',').map(Number).filter(Number.isInteger));
    setSeededFrom(productsParam);
    setSeedProducts(products.filter((p) => ids.has(p.id)));
    setMode('create');
    setSelected(null);
    setFormError(null);
  }
  useEffect(() => {
    if (!seededFrom || searchParams.get('products') !== seededFrom) return;
    const next = new URLSearchParams(searchParams);
    next.delete('products');
    setSearchParams?.(next, { replace: true });
  }, [seededFrom, searchParams, setSearchParams]);

  const changeView = (id) => {
    setSearchParams(id === 'open' ? {} : { status: id }, { replace: true });
  };

  // ── Actions ────────────────────────────────────────────────
  const create = async (payload) => {
    setBusy(true); setFormError(null); setInvalidProductIds([]);
    try {
      const created = await purchaseOrderAPI.createPurchaseOrder(payload);
      await loadPurchaseOrders();
      // Straight into the new PO rather than back to a list where the
      // manager has to find what they just made.
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

  const update = async (payload) => {
    setBusy(true); setFormError(null); setInvalidProductIds([]);
    try {
      const updated = await purchaseOrderAPI.updatePurchaseOrder(selected.id, payload);
      await loadPurchaseOrders();
      setSelected(updated);
      setMode('list');
    } catch (err) {
      setFormError(err.message);
      if (err.missingProductIds) setInvalidProductIds(err.missingProductIds);
    } finally {
      setBusy(false);
    }
  };

  // Status changes report through a toast and return whether they
  // worked, so the panel knows whether to close its own editor.
  const changeStatus = async (status, reason, done) => {
    try {
      await purchaseOrderAPI.setPurchaseOrderStatus(selected.id, status, reason);
      await loadPurchaseOrders();
      await open(selected.id);
      toast({ variant: 'success', title: done });
      return true;
    } catch (err) {
      toast({ variant: 'error', title: 'Could not change this order', description: err.message });
      return false;
    }
  };

  const remove = async () => {
    try {
      await purchaseOrderAPI.deletePurchaseOrder(selected.id);
      await loadPurchaseOrders();
      setSelected(null);
      return true;
    } catch (err) {
      toast({ variant: 'error', title: 'Could not delete this order', description: err.message });
      return false;
    }
  };

  const setQuickbooksRef = async (quickbooksPoId) => {
    try {
      await purchaseOrderAPI.setQuickbooksReference(selected.id, quickbooksPoId);
      await loadPurchaseOrders();
      await open(selected.id);
      return true;
    } catch (err) {
      toast({ variant: 'error', title: 'Could not save the QuickBooks reference', description: err.message });
      return false;
    }
  };

  // Resend the Finance email. Returns success like setQuickbooksRef so
  // the button can stop spinning either way. The order is reloaded in
  // both cases: a failed attempt still leaves a status behind.
  const resendFinanceEmail = async () => {
    try {
      await purchaseOrderAPI.resendFinanceEmail(selected.id);
      await open(selected.id);
      return true;
    } catch (err) {
      toast({ variant: 'error', title: 'Could not resend to Finance', description: err.message });
      await open(selected.id);
      return false;
    }
  };

  // ── The list ───────────────────────────────────────────────
  const counts = useMemo(
    () => Object.fromEntries(PO_VIEWS.map((v) => [v.id, purchaseOrders.filter(v.test).length])),
    [purchaseOrders],
  );
  const { sortRows } = tableView;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inView = purchaseOrders.filter(viewById(view).test).filter((po) => !q
      || po.poNumber?.toLowerCase().includes(q)
      || po.supplierName?.toLowerCase().includes(q));
    return sortRows(inView);
  }, [purchaseOrders, view, search, sortRows]);

  const exportRows = () => downloadCsv(
    `purchase-orders-${view}.csv`,
    toCsv(rows.map((po) => ({ ...po, statusLabel: PO_STATUS_LABELS[po.status] ?? po.status })), EXPORT_COLUMNS),
  );

  return (
    <PageShell>
      <PageHeader
        title="Purchase orders"
        description="Raise, approve and track orders to suppliers."
        actions={canManage && mode === 'list' ? (
          <>
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              <Link2 /> Import QuickBooks links
            </Button>
            <Button
              type="button"
              onClick={() => { setMode('create'); setSeedProducts([]); setSelected(null); setFormError(null); }}
            >
              <Plus /> New purchase order
            </Button>
          </>
        ) : null}
      />

      {mode === 'create' || mode === 'edit' ? (
        <div className="mt-6">
          <PurchaseOrderForm
            // Forces a remount (and so a fresh read of initialValue)
            // whenever the target changes — create vs. edit, or one
            // PO's edit vs. another's.
            key={mode === 'edit' ? `edit-${selected?.id}` : 'create'}
            suppliers={suppliers}
            products={products}
            busy={busy}
            error={formError}
            invalidProductIds={invalidProductIds}
            initialValue={mode === 'edit' ? selected : null}
            initialProducts={mode === 'create' ? seedProducts : []}
            submitLabel={mode === 'edit' ? 'Save changes' : undefined}
            onSubmit={mode === 'edit' ? update : create}
            onCancel={() => {
              if (mode === 'create') setSelected(null);
              setMode('list');
              setSeedProducts([]);
              setFormError(null);
              setInvalidProductIds([]);
            }}
          />
        </div>
      ) : (
        <>
          <ErrorBanner className="mt-4" message={error} onRetry={reload} />

          <ViewTabs
            className="mt-5"
            label="Purchase order views"
            value={view}
            onChange={changeView}
            tabs={PO_VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: isLoading ? null : counts[v.id] }))}
          />

          <ListCard
            className="mt-6"
            header={
              <ListToolbar
                search={{ value: search, onChange: setSearch, placeholder: 'Search PO number or supplier' }}
                columns={{
                  idPrefix: 'po',
                  columns: tableView.availableColumns,
                  hidden: tableView.hidden,
                  onToggle: tableView.toggleColumn,
                  onReset: tableView.resetColumns,
                }}
                onExport={rows.length ? exportRows : undefined}
              />
            }
          >
            {isLoading ? (
              <div className="space-y-2 p-4" aria-busy="true">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <PurchaseOrderList
                purchaseOrders={rows}
                selectedId={selected?.id ?? null}
                onSelect={open}
                columns={tableView.visibleColumns}
                sort={tableView.sort}
                onToggleSort={tableView.toggleSort}
              />
            )}
          </ListCard>
        </>
      )}

      {selected && mode === 'list' ? (
        <PurchaseOrderDetail
          key={selected.id}
          purchaseOrder={selected}
          canManage={canManage}
          onApprove={() => changeStatus('approved', null, `${selected.poNumber} approved`)}
          onRecordFollowUp={(reason) => changeStatus('follow_up_required', reason, `Follow-up recorded on ${selected.poNumber}`)}
          onReopen={() => changeStatus('approved', null, `${selected.poNumber} reopened for receiving`)}
          onSetQuickbooksRef={setQuickbooksRef}
          onResendFinanceEmail={resendFinanceEmail}
          onEdit={() => { setMode('edit'); setFormError(null); setInvalidProductIds([]); }}
          onDelete={remove}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {canManage ? (
        <QuickbooksImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onDone={async () => {
            await loadPurchaseOrders();
            if (selected) await open(selected.id);
          }}
        />
      ) : null}
    </PageShell>
  );
}
