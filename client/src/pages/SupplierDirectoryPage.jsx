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
import SupplierForm  from '../features/suppliers/components/SupplierForm';
import ProspectPad   from '../features/suppliers/components/ProspectPad';
import supplierAPI   from '../services/supplierAPI';
import ConfirmRemoveDialog from '../features/masterdata/components/ConfirmRemoveDialog';
import useOpenFromQuery    from '../features/masterdata/hooks/useOpenFromQuery';
import useTableView        from '../features/masterdata/hooks/useTableView';
import MasterDataTable     from '../features/masterdata/components/MasterDataTable';
import { PO_STATUS_LABELS } from '../services/purchaseOrderAPI';

import { Button }    from '@/components/ui/button';
import { Skeleton }  from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import StatusBadge   from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs      from '@/components/ui/view-tabs';
import ListCard      from '@/components/ui/list-card';
import ListToolbar   from '@/components/ui/list-toolbar';
import DetailPanel   from '@/components/ui/detail-panel';
import EmptyState    from '@/components/ui/empty-state';
import ErrorBanner   from '@/components/ui/error-banner';
import { Plus, Pencil, Power, AlertTriangle, Trash2, Truck } from 'lucide-react';

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
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={supplier.category || 'No category recorded'}
      title={supplier.name}
      badges={!supplier.isActive ? <StatusBadge kind="record" status="inactive">Inactive</StatusBadge> : null}
      actions={canManage ? (
        <>
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil />
            Edit details
          </Button>
          <Button type="button" variant="outline" onClick={onToggleActive}>
            <Power />
            {supplier.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
          <Button type="button" variant="destructive" onClick={onRemove}>
            <Trash2 />
            Delete
          </Button>
        </>
      ) : null}
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Contact</dt><dd>{supplier.contactName || '—'}</dd></div>
        <div><dt className="text-muted-foreground">Email</dt><dd className="break-words">{supplier.contactEmail || '—'}</dd></div>
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

      {/* Deactivation is never blocked on open orders — the system
          records what is, it does not prevent it. The warning is the
          whole guard, same principle as the dispatch gate. */}
      {supplier.isActive && (s.openPurchaseOrders ?? 0) > 0 ? (
        <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {s.openPurchaseOrders} purchase order{s.openPurchaseOrders === 1 ? '' : 's'} still open.
            Deactivating hides this supplier from new orders; it does not cancel existing ones.
          </span>
        </p>
      ) : null}

      <Separator />

      <dl className="grid grid-cols-2 divide-x rounded-lg border sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

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
                <TableHead className="text-right">Lines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplier.purchaseOrders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>#{po.id}</TableCell>
                  <TableCell>
                    <StatusBadge kind="purchaseOrder" status={po.status}>{PO_STATUS_LABELS[po.status] ?? po.status}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(po.expectedDeliveryDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(po.deliveredOn)}</TableCell>
                  <TableCell className="text-right tabular-nums">{po.lineCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </DetailPanel>
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
    cell: (s) => (!s.isActive ? <StatusBadge kind="record" status="inactive">Inactive</StatusBadge> : null) },
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
    const request = tab === 'suppliers'
      ? supplierAPI.getSuppliers({ includeInactive, search })
      : supplierAPI.getProspects();
    request
      .then((rows) => {
        if (cancelled) return;
        if (tab === 'suppliers') setSuppliers(rows);
        else setProspects(rows);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || (tab === 'suppliers'
            ? 'Could not load suppliers.'
            : 'Could not load prospects.'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, includeInactive, search]);

  const open = async (id) => {
    setError(null);
    try {
      setSelected(await supplierAPI.getSupplier(id));
      setMode('list');
    } catch (err) { setError(err.message); }
  };
  // ?open=<id> from the admin Activity / Archive screens.
  useOpenFromQuery(open);

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

  const switchTab = (id) => { setIsLoading(true); setTab(id); setSelected(null); setMode('list'); };

  return (
    <PageShell>
      <PageHeader
        title="Supplier Management"
        description="Who we buy from, and who we might buy from."
        actions={canManage && tab === 'suppliers' ? (
          <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
            <Plus />
            Register supplier
          </Button>
        ) : null}
      />

      <ViewTabs className="mt-5" label="Supplier views" value={tab} onChange={switchTab} tabs={TABS} />

      <ErrorBanner className="mt-4" message={error} onRetry={reload} />

      {tab === 'prospects' ? (
        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <ProspectPad
              prospects={prospects}
              busy={busy}
              onAdd={addProspect}
              onSetStatus={setProspectStatus}
              onConvert={convert}
              onDelete={removeProspect}
            />
          )}
        </div>
      ) : (
        <div className="mt-6">
          <ListCard
            // Mounted through a reload: the search triggers the fetch,
            // and swapping it for a skeleton would lose focus.
            header={
              <ListToolbar
                search={{
                  value: search,
                  onChange: (value) => { setIsLoading(true); setSearch(value); },
                  placeholder: 'Search name, category or agreement',
                }}
                // Categories are free text, so the menu offers the ones
                // actually present (categoryOptions), one at a time.
                filters={[
                  {
                    key: 'inactive', label: 'Show inactive', active: includeInactive,
                    onToggle: () => { setIsLoading(true); setIncludeInactive((v) => !v); },
                  },
                  ...categoryPills.map((c) => ({
                    key: `cat-${c.value}`, label: c.label, active: categoryFilter === c.value,
                    onToggle: () => setCategoryFilter((cur) => (cur === c.value ? null : c.value)),
                  })),
                ]}
                onClearAll={() => { setCategoryFilter(null); if (includeInactive) { setIsLoading(true); setIncludeInactive(false); } }}
                columns={{
                  idPrefix: 'suppliers',
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
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : visibleSuppliers.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="No suppliers match"
                description={search || categoryFilter ? 'Nothing matches the search or category.' : 'No supplier is registered yet.'}
                action={search || categoryFilter
                  ? { label: 'Clear all filters', onClick: () => { setCategoryFilter(null); if (search) { setIsLoading(true); setSearch(''); } } }
                  : undefined}
              />
            ) : (
              <MasterDataTable
                columns={view.visibleColumns}
                rows={visibleSuppliers}
                sort={view.sort}
                onToggleSort={view.toggleSort}
                onOpenRow={(row) => open(row.id)}
                noun="suppliers"
              />
            )}
          </ListCard>
        </div>
      )}

      {mode === 'list' && selected ? (
        <SupplierDetail
          key={selected.id}
          supplier={selected}
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
          noun="supplier"
          isActive={selected.isActive}
          busy={busy}
          historyNote="Past purchase orders, delivery notes and receipts keep their name."
          onDeactivate={deactivateFromDialog}
          onDelete={remove}
        />
      ) : null}

      {mode === 'create' ? (
        <DetailPanel open onClose={() => setMode('list')} title="Register a supplier">
          <SupplierForm onSubmit={create} onCancel={() => setMode('list')} busy={busy} />
        </DetailPanel>
      ) : null}

      {mode === 'edit' && selected ? (
        <DetailPanel open onClose={() => setMode('list')} eyebrow="Edit" title={selected.name}>
          <SupplierForm
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
