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
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import ProductForm  from '../features/products/components/ProductForm';
import productAPI   from '../services/productAPI';
import ConfirmRemoveDialog from '../features/masterdata/components/ConfirmRemoveDialog';
import useDetailFocus      from '../features/masterdata/hooks/useDetailFocus';
import useTableView        from '../features/masterdata/hooks/useTableView';
import MasterDataTable     from '../features/masterdata/components/MasterDataTable';
import ColumnToggle        from '../features/masterdata/components/ColumnToggle';
import FilterPills         from '../features/masterdata/components/FilterPills';

import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Checkbox }  from '@/components/ui/checkbox';
import { Skeleton }  from '@/components/ui/skeleton';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Search, Plus, Pencil, Power, X, Trash2 } from 'lucide-react';

// Admin only, matching requireRole on every write in
// product.routes.js. The server is the control; this is what stops the
// screen offering a button that would come back 403.
const CAN_MANAGE = ['admin'];

// products.storage_type carries its own CHECK — 'dry' or 'cold' and
// nothing else (STORAGE_TYPES in product.service.js). A pill per value,
// so the filter can never offer something the column cannot hold.
const STORAGE_FILTERS = [
  { value: 'dry',  label: 'Dry' },
  { value: 'cold', label: 'Cold' },
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
    cellClass: 'text-right',
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

// ── Detail panel ──────────────────────────────────────────────
const ProductDetail = ({ product, canManage, onEdit, onToggleActive, onRemove, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>{product.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {product.category || 'No category recorded'}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
        <X />
      </Button>
    </CardHeader>

    <CardContent className="space-y-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
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

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil />
            Edit details
          </Button>
          <Button type="button" variant="outline" onClick={onToggleActive}>
            <Power />
            {product.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
          {/* Outline, not a solid red block. A filled destructive
              button beside two outlined ones pulls the eye to the one
              action nobody should reach for by reflex. The red border
              and label are enough to say what it is; the dialog does
              the actual guarding. */}
          <Button
            type="button"
            variant="outline"
            onClick={onRemove}
            className="border-[#ef3a40] text-[#ef3a40] hover:bg-[#ef3a40] hover:text-white"
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      ) : null}
    </CardContent>
  </Card>
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
  const [storageFilter, setStorageFilter] = useState(null);
  const view = useTableView('products', COLUMNS);

  // Brings the detail card to the click instead of making the admin
  // scroll back up to find it.
  const [detailRef, focusDetail] = useDetailFocus();

  // Narrow first, then order — same composition as the user
  // directory. Both are client-side over the already-fetched rows, so
  // neither races the server-side search.
  const visibleProducts = useMemo(() => {
    const filtered = storageFilter
      ? products.filter((p) => p.storageType === storageFilter)
      : products;
    return view.sortRows(filtered);
  }, [products, storageFilter, view]);

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
    setIsLoading(true);
    loadProducts().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [loadProducts]);

  const open = async (id) => {
    setError(null);
    try {
      setSelected(await productAPI.getProduct(id));
      setMode('list');
      focusDetail();
    } catch (err) { setError(err.message); }
  };

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
    <ManagerLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Product Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What we stock, and what every other module counts against.
        </p>

        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} onRetry={loadProducts} />
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
            {mode === 'create' ? (
              <Card>
                <CardHeader><CardTitle>Add a product</CardTitle></CardHeader>
                <CardContent>
                  <ProductForm onSubmit={create} onCancel={() => setMode('list')} busy={busy} />
                </CardContent>
              </Card>
            ) : mode === 'edit' && selected ? (
              <Card>
                <CardHeader><CardTitle>Edit {selected.name}</CardTitle></CardHeader>
                <CardContent>
                  <ProductForm
                    initial={selected}
                    submitLabel="Save changes"
                    onSubmit={save}
                    onCancel={() => setMode('list')}
                    busy={busy}
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <InputGroup className="min-w-56 flex-1">
                    <InputGroupAddon align="inline-start">
                      <Search />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder="Search by name, SKU or category"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </InputGroup>

                  <Field orientation="horizontal" className="w-auto">
                    <Checkbox
                      id="include-inactive"
                      checked={includeInactive}
                      onCheckedChange={(v) => setIncludeInactive(Boolean(v))}
                    />
                    <FieldLabel htmlFor="include-inactive" className="font-normal">
                      Show inactive
                    </FieldLabel>
                  </Field>

                  <FilterPills
                    label="Filter by storage type"
                    value={storageFilter}
                    onChange={setStorageFilter}
                    options={STORAGE_FILTERS}
                  />

                  <ColumnToggle
                    idPrefix="products"
                    columns={view.availableColumns}
                    hidden={view.hidden}
                    onToggle={view.toggleColumn}
                    onReset={view.resetColumns}
                  />

                  {canManage ? (
                    <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
                      <Plus />
                      Add product
                    </Button>
                  ) : null}
                </div>

                {/* tabIndex so focus can be moved here; scroll-mt so the
                    card does not land flush against the top edge. */}
                <div ref={detailRef} tabIndex={-1} className="scroll-mt-6 outline-none">
                  {selected ? (
                    <ProductDetail
                      product={selected}
                      canManage={canManage}
                      onEdit={() => setMode('edit')}
                      onToggleActive={toggleActive}
                      onRemove={() => setConfirmRemove(true)}
                      onClose={() => setSelected(null)}
                    />
                  ) : null}
                </div>

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

                {visibleProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products match.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <MasterDataTable
                        columns={view.visibleColumns}
                        rows={visibleProducts}
                        sort={view.sort}
                        onToggleSort={view.toggleSort}
                        onOpenRow={(p) => open(p.id)}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </ManagerLayout>
  );
}
