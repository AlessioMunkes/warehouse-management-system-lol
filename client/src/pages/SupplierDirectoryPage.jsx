// ─────────────────────────────────────────────────────────────
// client/src/pages/SupplierDirectoryPage.jsx
//
// Two tabs: registered suppliers, and the prospect pad. They are
// separate tables in the database for good reasons (see the
// migration) and separate tabs here for the same one — a lead must
// never be mistaken for someone we actually buy from.
//
// Manager view. App.jsx gates the route and every write endpoint in
// supplier.routes.js is requireRole(MANAGER, ADMIN); the useAuth
// check below is belt-and-braces for the same reason
// InventoryManagementPage does it — the route decides who reaches the
// page, the role check decides what the page offers them.
//
// The error banner is the one from InventoryManagementPage, brand hex
// and "Try again" action included, rather than a second error style.
//
// The tab strip is hand-rolled because there is no tabs.jsx in
// components/ui and .stf-tab is StaffShell's phone-first bottom bar,
// which is a different thing. If a Tabs primitive is ever added, this
// is the first place that should use it.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth }   from '../context/AuthContext';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import SupplierForm  from '../features/suppliers/components/SupplierForm';
import ProspectPad   from '../features/suppliers/components/ProspectPad';
import supplierAPI   from '../services/supplierAPI';
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
import { Separator } from '@/components/ui/separator';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Plus, Pencil, Power, X, AlertTriangle, Trash2 } from 'lucide-react';

// Admin only, matching supplier.routes.js. The prospect pad is the
// exception and stays open to managers — see the note on PROSPECTS
// there — so this constant gates supplier editing, not the pad.
const CAN_MANAGE = ['admin'];

const TABS = [
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'prospects', label: 'Prospects' },
];

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

// Same markup as the global fetch error banner in
// InventoryManagementPage. One error style per app.
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
const SupplierDetail = ({ supplier, canManage, onEdit, onToggleActive, onRemove, onClose }) => {
  const s = supplier.stats ?? {};
  const stats = [
    ['Purchase orders',    s.purchaseOrderCount ?? 0],
    ['Open POs',           s.openPurchaseOrders ?? 0],
    ['Deliveries',         s.deliveryNoteCount ?? 0],
    ['Open discrepancies', s.openDiscrepancies ?? 0],
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{supplier.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {supplier.category || 'No category recorded'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Contact</dt><dd>{supplier.contactName || '—'}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt><dd>{supplier.contactEmail || '—'}</dd></div>
          <div><dt className="text-muted-foreground">Phone</dt><dd>{supplier.contactPhone || '—'}</dd></div>
          <div><dt className="text-muted-foreground">Agreement</dt><dd>{supplier.agreementRef || 'None on file'}</dd></div>
          <div><dt className="text-muted-foreground">Payment terms</dt><dd>{supplier.paymentTerms || '—'}</dd></div>
          <div>
            <dt className="text-muted-foreground">Expected lead time</dt>
            {/* null and 0 mean different things: "nobody recorded it"
                versus "same day". Number(null) would collapse both. */}
            <dd>
              {supplier.expectedLeadTimeDays === null
                ? 'Not recorded'
                : `${supplier.expectedLeadTimeDays} days`}
            </dd>
          </div>
        </dl>

        {supplier.notes ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{supplier.notes}</p>
        ) : null}

        <Separator />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-medium">{value}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Last delivery: {fmtDate(s.lastDeliveryDate)}
        </p>

        {supplier.purchaseOrders?.length ? (
          <div>
            <h3 className="mb-2 text-sm font-medium">Recent purchase orders</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Lines</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplier.purchaseOrders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell>#{po.id}</TableCell>
                    <TableCell>{po.status}</TableCell>
                    <TableCell>{fmtDate(po.expectedDeliveryDate)}</TableCell>
                    <TableCell>{fmtDate(po.deliveredOn)}</TableCell>
                    <TableCell>{po.lineCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onEdit}>
              <Pencil />
              Edit details
            </Button>
            <Button type="button" variant="outline" onClick={onToggleActive}>
              <Power />
              {supplier.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
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

        {/* Deactivation is never blocked on open orders — the system
            records what is, it does not prevent it. The warning is
            the whole guard, same principle as the dispatch gate. */}
        {supplier.isActive && (s.openPurchaseOrders ?? 0) > 0 ? (
          <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {s.openPurchaseOrders} purchase order{s.openPurchaseOrders === 1 ? '' : 's'} still open.
              Deactivating hides this supplier from new orders; it does not cancel existing ones.
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

// ── Page ──────────────────────────────────────────────────────
// suppliers.category is free text, not an enum — there is no fixed
// list to hard-code the way products.storage_type has one. So the
// pills are built from the categories actually present in the fetched
// rows: every pill is guaranteed to match something, and a category
// added next month appears without anybody editing this file.
//
// Capped, because a free-text column can hold anything and eight pills
// across the toolbar is not a filter any more.
const MAX_CATEGORY_PILLS = 6;

const categoryOptions = (suppliers) => {
  const seen = new Map();
  for (const s of suppliers) {
    const value = (s.category ?? '').trim();
    if (!value) continue;
    seen.set(value, (seen.get(value) ?? 0) + 1);
  }
  return [...seen.entries()]
    // Commonest first: the pills worth having are the ones that narrow
    // a long list, not the one supplier filed under something unusual.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en-ZA'))
    .slice(0, MAX_CATEGORY_PILLS)
    .map(([value]) => ({ value, label: value }));
};

const COLUMNS = [
  { key: 'name',     label: 'Supplier', alwaysOn: true, weight: 3,
    sort: (s) => (s.name ?? '').toLowerCase(),
    cellClass: 'font-medium',
    cell: (s) => s.name },
  { key: 'category', label: 'Category', weight: 2, minWidth: 'md',
    sort: (s) => (s.category ?? '').toLowerCase(),
    cell: (s) => s.category || '—' },
  { key: 'contact',  label: 'Contact', weight: 3, minWidth: 'sm',
    sort: (s) => (s.contactEmail ?? '').toLowerCase(),
    cell: (s) => s.contactEmail || '—' },
  { key: 'phone',    label: 'Phone', weight: 2, minWidth: 'lg',
    sort: (s) => (s.contactPhone ?? '').toLowerCase(),
    cell: (s) => s.contactPhone || '—' },
  // numeric, so 10 days sorts after 9 rather than before it, and a
  // supplier with no recorded lead time sorts last either way.
  { key: 'leadTime', label: 'Lead time', numeric: true, weight: 1.6, minWidth: 'lg',
    sort: (s) => (s.expectedLeadTimeDays ?? null),
    cell: (s) => (s.expectedLeadTimeDays === null ? '—' : `${s.expectedLeadTimeDays} days`) },
  { key: 'status',   label: '', sort: null, alwaysOn: true, weight: 1.8,
    cell: (s) => (!s.isActive ? <Badge variant="outline">Inactive</Badge> : null) },
];

export default function SupplierDirectoryPage() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [tab, setTab] = useState('suppliers');
  const [suppliers, setSuppliers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | create | edit

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const view = useTableView('suppliers', COLUMNS);

  const [detailRef, focusDetail] = useDetailFocus();

  const categoryPills = useMemo(() => categoryOptions(suppliers), [suppliers]);

  const visibleSuppliers = useMemo(() => {
    const filtered = categoryFilter
      ? suppliers.filter((s) => (s.category ?? '').trim() === categoryFilter)
      : suppliers;
    return view.sortRows(filtered);
  }, [suppliers, categoryFilter, view]);

  const loadSuppliers = useCallback(async () => {
    setError(null);
    try {
      setSuppliers(await supplierAPI.getSuppliers({ includeInactive, search }));
    } catch (err) {
      setError(err.message || 'Could not load suppliers.');
    }
  }, [includeInactive, search]);

  const loadProspects = useCallback(async () => {
    setError(null);
    try {
      setProspects(await supplierAPI.getProspects());
    } catch (err) {
      setError(err.message || 'Could not load prospects.');
    }
  }, []);

  const reload = useCallback(
    () => (tab === 'suppliers' ? loadSuppliers() : loadProspects()),
    [tab, loadSuppliers, loadProspects]
  );

  // The cancelled flag is the same guard InventoryManagementPage uses:
  // a fast tab switch would otherwise let a stale response overwrite
  // fresher state.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    reload().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const open = async (id) => {
    setError(null);
    try {
      setSelected(await supplierAPI.getSupplier(id));
      setMode('list');
      focusDetail();
    } catch (err) { setError(err.message); }
  };

  const deactivateFromDialog = async () => {
    setBusy(true);
    try {
      await supplierAPI.setSupplierStatus(selected.id, false);
      setConfirmRemove(false);
      await loadSuppliers();
      await open(selected.id);
    } catch (err) { setError(err.message); setConfirmRemove(false); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await supplierAPI.deleteSupplier(selected.id);
      setConfirmRemove(false);
      setSelected(null);
      await loadSuppliers();
    } catch (err) { setError(err.message); setConfirmRemove(false); }
    finally { setBusy(false); }
  };

  const create = async (payload) => {
    setBusy(true); setError(null);
    try {
      const created = await supplierAPI.registerSupplier(payload);
      setMode('list');
      await loadSuppliers();
      await open(created.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const save = async (payload) => {
    setBusy(true); setError(null);
    try {
      await supplierAPI.updateSupplier(selected.id, payload);
      setMode('list');
      await loadSuppliers();
      await open(selected.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const toggleActive = async () => {
    setError(null);
    try {
      await supplierAPI.setSupplierStatus(selected.id, !selected.isActive);
      await loadSuppliers();
      await open(selected.id);
    } catch (err) { setError(err.message); }
  };

  // ── Prospect handlers ───────────────────────────────────────
  const addProspect = async (payload) => {
    setBusy(true); setError(null);
    try { await supplierAPI.addProspect(payload); await loadProspects(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const setProspectStatus = async (id, status) => {
    setError(null);
    try { await supplierAPI.updateProspect(id, { status }); await loadProspects(); }
    catch (err) { setError(err.message); }
  };

  const removeProspect = async (id) => {
    setError(null);
    try { await supplierAPI.deleteProspect(id); await loadProspects(); }
    catch (err) { setError(err.message); }
  };

  // Conversion lands the user in the edit form on the new supplier
  // rather than silently creating one — the fields a lead never had
  // are the entire point of the step.
  const convert = async (prospect) => {
    setBusy(true); setError(null);
    try {
      const { supplier } = await supplierAPI.convertProspect(prospect.id, {});
      await loadProspects();
      setTab('suppliers');
      await loadSuppliers();
      await open(supplier.id);
      setMode('edit');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Supplier Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who we buy from, and who we might buy from.
        </p>

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
        ) : tab === 'prospects' ? (
          <div className="mt-6">
            <ProspectPad
              prospects={prospects}
              busy={busy}
              onAdd={addProspect}
              onSetStatus={setProspectStatus}
              onConvert={convert}
              onDelete={removeProspect}
            />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {mode === 'create' ? (
              <Card>
                <CardHeader><CardTitle>Register a supplier</CardTitle></CardHeader>
                <CardContent>
                  <SupplierForm onSubmit={create} onCancel={() => setMode('list')} busy={busy} />
                </CardContent>
              </Card>
            ) : mode === 'edit' && selected ? (
              <Card>
                <CardHeader><CardTitle>Edit {selected.name}</CardTitle></CardHeader>
                <CardContent>
                  <SupplierForm
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
                      placeholder="Search by name, category or agreement reference"
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
                    label="Filter by category"
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={categoryPills}
                  />

                  <ColumnToggle
                    idPrefix="suppliers"
                    columns={view.availableColumns}
                    hidden={view.hidden}
                    onToggle={view.toggleColumn}
                    onReset={view.resetColumns}
                  />

                  {canManage ? (
                    <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
                      <Plus />
                      Register supplier
                    </Button>
                  ) : null}
                </div>

                <div ref={detailRef} tabIndex={-1} className="scroll-mt-6 outline-none">
                  {selected ? (
                    <SupplierDetail
                      supplier={selected}
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
                    noun="supplier"
                    isActive={selected.isActive}
                    busy={busy}
                    historyNote="Past purchase orders, delivery notes and receipts keep their name."
                    onDeactivate={deactivateFromDialog}
                    onDelete={remove}
                  />
                ) : null}

                {visibleSuppliers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No suppliers match.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <MasterDataTable
                        columns={view.visibleColumns}
                        rows={visibleSuppliers}
                        sort={view.sort}
                        onToggleSort={view.toggleSort}
                        onOpenRow={(s) => open(s.id)}
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
