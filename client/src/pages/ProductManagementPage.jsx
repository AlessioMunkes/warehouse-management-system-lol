// ─────────────────────────────────────────────────────────────
// client/src/pages/ProductManagementPage.jsx
//
// Manager view, same reasoning as SupplierDirectoryPage.jsx /
// UserDirectoryPage.jsx: App.jsx gates the route and every write
// endpoint in product.routes.js is requireRole(MANAGER, ADMIN); the
// useAuth check below is belt-and-braces the same way.
//
// One list, no tabs — there is no prospect-style draft concept for
// products the way there is for suppliers.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth }  from '../context/AuthContext';
import ProductForm  from '../features/products/components/ProductForm';
import productAPI   from '../services/productAPI';
import ConfirmRemoveDialog from '../features/masterdata/components/ConfirmRemoveDialog';
import useOpenFromQuery    from '../features/masterdata/hooks/useOpenFromQuery';
import useTableView        from '../features/masterdata/hooks/useTableView';
import MasterDataTable     from '../features/masterdata/components/MasterDataTable';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Skeleton }  from '@/components/ui/skeleton';
import StatusBadge   from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs      from '@/components/ui/view-tabs';
import ListCard      from '@/components/ui/list-card';
import ListToolbar   from '@/components/ui/list-toolbar';
import DetailPanel   from '@/components/ui/detail-panel';
import EmptyState    from '@/components/ui/empty-state';
import ErrorBanner   from '@/components/ui/error-banner';
import { Plus, Pencil, Power, Trash2, Package } from 'lucide-react';
import { useRecordCache } from '@/lib/recordCache';

// Admin only, matching requireRole on every write in
// product.routes.js. The server is the control; this is what stops the
// screen offering a button that would come back 403.
const CAN_MANAGE = ['admin'];

// products.storage_type carries its own CHECK — 'dry' or 'cold' and
// nothing else (STORAGE_TYPES in product.service.js). A pill per value,
// so the filter can never offer something the column cannot hold.
// Storage type as tabs, client-side over the fetched rows, so they
// compose with the server-side search and "Show inactive".
const VIEWS = [
  { id: 'all',  label: 'All',  test: () => true },
  { id: 'dry',  label: 'Dry',  test: (p) => p.storageType === 'dry' },
  { id: 'cold', label: 'Cold', test: (p) => p.storageType === 'cold' },
];

// Three columns more than the table used to show, all of them things
// somebody asks about — storage and perishability decide where a
// delivery is put away, and both were only visible by opening the row
// one at a time. The column toggle is what makes six columns bearable.
const COLUMNS = [
  { key: 'name',     label: 'Product', alwaysOn: true, weight: 4,
    sort: (p) => (p.name ?? '').toLowerCase(),
    cellClass: 'font-medium',
    cell: (p) => p.name },
  { key: 'sku',      label: 'SKU', weight: 2.2,
    sort: (p) => (p.sku ?? '').toLowerCase(),
    cell: (p) => p.sku || '—' },
  { key: 'category', label: 'Category', weight: 2, minWidth: 'sm',
    sort: (p) => (p.category ?? '').toLowerCase(),
    cell: (p) => p.category || '—' },
  { key: 'unit',     label: 'Unit', weight: 1.2, minWidth: 'md',
    sort: (p) => (p.defaultUnit ?? '').toLowerCase(),
    cell: (p) => p.defaultUnit || '—' },
  { key: 'storage',  label: 'Storage', weight: 1.5, minWidth: 'lg',
    sort: (p) => (p.storageType ?? '').toLowerCase(),
    cell: (p) => (p.storageType ? p.storageType.replace(/^./, (c) => c.toUpperCase()) : '—') },
  { key: 'cost',     label: 'Cost', weight: 1.6, minWidth: 'lg', numeric: true,
    // Sorts on the number and shows the currency. Null is "not priced",
    // which sorts last in both directions rather than reading as the
    // cheapest thing in the catalogue.
    sort: (p) => (p.unitCost ?? null),
    cellClass: 'text-center',
    cell: (p) => (p.unitCost === null || p.unitCost === undefined
      ? '—'
      : `R ${p.unitCost.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`) },
  { key: 'perishable', label: 'Perishable', weight: 1.7, minWidth: 'lg',
    sort: (p) => (p.isPerishable ? 'yes' : 'no'),
    cell: (p) => (p.isPerishable ? 'Yes' : 'No') },
  { key: 'status',   label: '', sort: null, alwaysOn: true, weight: 1.8,
    cell: (p) => (!p.isActive ? <Badge variant="outline">Inactive</Badge> : null) },
];

// Same markup as the global fetch error banner in
// SupplierDirectoryPage/InventoryManagementPage. One error style per app.
const ProductDetail = ({ product, canManage, onEdit, onToggleActive, onRemove, onClose }) => (
  <DetailPanel
    open
    onClose={onClose}
    eyebrow={product.category || 'No category recorded'}
    title={product.name}
    badges={!product.isActive ? <StatusBadge kind="record" status="inactive">Inactive</StatusBadge> : null}
    // Delete is the soft destructive variant, not a solid red block: a
    // filled button beside two outlined ones pulls the eye to the one
    // action nobody should reach for by reflex. The dialog does the
    // actual guarding.
    actions={canManage ? (
      <>
        <Button type="button" variant="outline" onClick={onEdit}>
          <Pencil />
          Edit details
        </Button>
        <Button type="button" variant="outline" onClick={onToggleActive}>
          <Power />
          {product.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
        <Button type="button" variant="destructive" onClick={onRemove}>
          <Trash2 />
          Delete
        </Button>
      </>
    ) : null}
  >
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">SKU</dt><dd>{product.sku || '—'}</dd></div>
      <div><dt className="text-muted-foreground">Default unit</dt><dd>{product.defaultUnit || '—'}</dd></div>
      <div>
        <dt className="text-muted-foreground">Weight</dt>
        <dd>{product.weightKg === null ? 'Not recorded' : `${product.weightKg} kg`}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Cost per item</dt>
        <dd>{product.unitCost === null || product.unitCost === undefined
          ? 'Not priced'
          : `R ${product.unitCost.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</dd>
      </div>
      <div><dt className="text-muted-foreground">Perishable</dt><dd>{product.isPerishable ? 'Yes' : 'No'}</dd></div>
    </dl>
  </DetailPanel>
);

// ── Page ──────────────────────────────────────────────────────
export default function ProductManagementPage() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | create | edit

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [tab, setTab] = useState('all');
  const view = useTableView('products', COLUMNS);
  const current = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];

  // Narrow first, then order — same composition as the user directory.
  const visibleProducts = useMemo(
    () => view.sortRows(products.filter(current.test)),
    [products, current, view],
  );
  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, products.filter(v.test).length])),
    [products],
  );

  const loadProducts = useCallback(async () => {
    setError(null);
    try {
      setProducts(await productAPI.getProducts({ includeInactive, search }));
    } catch (err) {
      setError(err.message || 'Could not load products.');
    }
  }, [includeInactive, search]);

  // The cancelled flag is the same guard SupplierDirectoryPage uses: a
  // fast search keystroke would otherwise let a stale response
  // overwrite fresher state.
  useEffect(() => {
    let cancelled = false;
    productAPI.getProducts({ includeInactive, search })
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load products.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [includeInactive, search]);

  // A row click reuses what resting on the row already asked for; every
  // other caller (after a save, from a link) reads the record again.
  const records = useRecordCache((id) => productAPI.getProduct(id));
  const open = async (id, { fresh = true } = {}) => {
    setError(null);
    try {
      setSelected(await records.load(id, { fresh }));
      setMode('list');
    } catch (err) { setError(err.message); }
  };
  // ?open=<id> from the admin Activity / Archive screens.
  useOpenFromQuery(open);

  const create = async (payload) => {
    setBusy(true); setError(null);
    try {
      const created = await productAPI.createProduct(payload);
      setMode('list');
      await loadProducts();
      await open(created.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const save = async (payload) => {
    setBusy(true); setError(null);
    try {
      await productAPI.updateProduct(selected.id, payload);
      setMode('list');
      await loadProducts();
      await open(selected.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const toggleActive = async () => {
    setError(null);
    try {
      await productAPI.setProductStatus(selected.id, !selected.isActive);
      await loadProducts();
      await open(selected.id);
    } catch (err) { setError(err.message); }
  };

  // Both of the dialog's destructive answers land here. Deactivating
  // from the dialog is the same call the Deactivate button makes — the
  // dialog is a place to choose, not a second code path.
  const deactivateFromDialog = async () => {
    setBusy(true);
    try {
      await productAPI.setProductStatus(selected.id, false);
      setConfirmRemove(false);
      await loadProducts();
      await open(selected.id);
    } catch (err) { setError(err.message); setConfirmRemove(false); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await productAPI.deleteProduct(selected.id);
      setConfirmRemove(false);
      // Nothing to reopen: the product has left the catalogue, so the
      // detail card would be showing something that is no longer here.
      setSelected(null);
      await loadProducts();
    } catch (err) { setError(err.message); setConfirmRemove(false); }
    finally { setBusy(false); }
  };

  return (
    <PageShell>
      <PageHeader
        title="Products"
        description="Add and edit the products the warehouse stocks."
        actions={canManage ? (
          <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
            <Plus />
            Add product
          </Button>
        ) : null}
      />

      <ErrorBanner className="mt-4" message={error} onRetry={loadProducts} />

      <ViewTabs
        className="mt-5"
        label="Product views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          // Mounted through a reload: the search triggers the fetch, and
          // swapping it for a skeleton would lose focus after each letter.
          header={
            <ListToolbar
              search={{
                value: search,
                onChange: (value) => { setIsLoading(true); setSearch(value); },
                placeholder: 'Search by name, SKU or category',
              }}
              filters={[{
                key: 'inactive', label: 'Show inactive', active: includeInactive,
                onToggle: () => { setIsLoading(true); setIncludeInactive((v) => !v); },
              }]}
              columns={{
                idPrefix: 'products',
                columns: view.availableColumns,
                hidden: view.hidden,
                onToggle: view.toggleColumn,
                onReset: view.resetColumns,
              }}
            />
          }
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products match"
              description={search ? 'Nothing matches the search.' : 'No product is in this view.'}
              action={search ? { label: 'Clear search', onClick: () => { setIsLoading(true); setSearch(''); } } : undefined}
            />
          ) : (
            <MasterDataTable
              columns={view.visibleColumns}
              rows={visibleProducts}
              sort={view.sort}
              onToggleSort={view.toggleSort}
              onOpenRow={(p) => open(p.id, { fresh: false })}
              onRowIntent={(p) => records.warm(p.id)}
              noun="products"
            />
          )}
        </ListCard>
      </div>

      {mode === 'list' && selected ? (
        <ProductDetail
          key={selected.id}
          product={selected}
          canManage={canManage}
          onEdit={() => setMode('edit')}
          onToggleActive={toggleActive}
          onRemove={() => setConfirmRemove(true)}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {selected ? (
        <ConfirmRemoveDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          name={selected.name}
          noun="product"
          isActive={selected.isActive}
          busy={busy}
          historyNote="Past picking slips, delivery notes and stock history keep showing it."
          onDeactivate={deactivateFromDialog}
          onDelete={remove}
        />
      ) : null}

      {mode === 'create' ? (
        <DetailPanel open onClose={() => setMode('list')} title="Add a product">
          <ProductForm onSubmit={create} onCancel={() => setMode('list')} busy={busy} />
        </DetailPanel>
      ) : null}

      {mode === 'edit' && selected ? (
        <DetailPanel open onClose={() => setMode('list')} eyebrow="Edit" title={selected.name}>
          <ProductForm
            initial={selected}
            submitLabel="Save changes"
            onSubmit={save}
            onCancel={() => setMode('list')}
            busy={busy}
          />
        </DetailPanel>
      ) : null}
    </PageShell>
  );
}
