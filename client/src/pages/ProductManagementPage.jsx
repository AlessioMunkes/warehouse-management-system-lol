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
import { useCallback, useEffect, useState } from 'react';
import { useAuth }  from '../context/AuthContext';
import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import ProductForm  from '../features/products/components/ProductForm';
import productAPI   from '../services/productAPI';

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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Plus, Pencil, Power, X } from 'lucide-react';

const CAN_MANAGE = ['manager', 'admin'];

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
const ProductDetail = ({ product, canManage, onEdit, onToggleActive, onClose }) => (
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
        </div>
      ) : null}
    </CardContent>
  </Card>
);

// ── Page ──────────────────────────────────────────────────────
export default function ProductManagementPage() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [reducedMovement, setReducedMovement] = useState(false);

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | create | edit

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={() => setReducedMovement((v) => !v)}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Products</h1>
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

                  {canManage ? (
                    <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
                      <Plus />
                      Add product
                    </Button>
                  ) : null}
                </div>

                {selected ? (
                  <ProductDetail
                    product={selected}
                    canManage={canManage}
                    onEdit={() => setMode('edit')}
                    onToggleActive={toggleActive}
                    onClose={() => setSelected(null)}
                  />
                ) : null}

                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products match.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((p) => (
                            <TableRow
                              key={p.id}
                              className="cursor-pointer"
                              onClick={() => open(p.id)}
                            >
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-muted-foreground">{p.sku || '—'}</TableCell>
                              <TableCell className="text-muted-foreground">{p.category || '—'}</TableCell>
                              <TableCell className="text-muted-foreground">{p.defaultUnit || '—'}</TableCell>
                              <TableCell>
                                {!p.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
