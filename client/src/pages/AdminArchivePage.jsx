// ─────────────────────────────────────────────────────────────
// client/src/pages/AdminArchivePage.jsx
//
// Archive (admin): everything switched off or deleted across the system.
// Deactivated items can be restored (through the item's own status
// route and its rules). Deleted users, products and suppliers can't come
// back, so they have no Restore button.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import adminAPI from '../services/adminAPI';
import { archiveLinkFor } from '../features/admin/recordLinks';
import { setUserStatus } from '../services/userAPI';
import { setProductStatus } from '../services/productAPI';
import { setSupplierStatus } from '../services/supplierAPI';
import { setBeneficiaryStatus } from '../services/beneficiaryAPI';
import useTableView    from '../features/masterdata/hooks/useTableView';
import MasterDataTable from '../features/masterdata/components/MasterDataTable';
import { Button, buttonVariants } from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import DetailPanel from '@/components/ui/detail-panel';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import { RotateCcw, ExternalLink, Archive } from 'lucide-react';

const SAST = 'Africa/Johannesburg';
const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: SAST });
};

// Amber: can be switched back on. Red: gone for good.
const StateBadge = ({ state }) => (
  <StatusBadge tone={state === 'deleted' ? 'bad' : 'warn'}>{state === 'deleted' ? 'Deleted' : 'Deactivated'}</StatusBadge>
);

const RESTORE = {
  user: (id) => setUserStatus(id, true),
  product: (id) => setProductStatus(id, true),
  supplier: (id) => setSupplierStatus(id, true),
  beneficiary: (id) => setBeneficiaryStatus(id, true),
};

const VIEWS = [
  { id: 'all',         label: 'All',         test: () => true },
  { id: 'deactivated', label: 'Deactivated', test: (x) => x.state === 'deactivated' },
  { id: 'deleted',     label: 'Deleted',     test: (x) => x.state === 'deleted' },
];

const COLUMNS = [
  { key: 'name', label: 'Name', alwaysOn: true, weight: 3.5,
    sort: (x) => (x.name ?? '').toLowerCase(), cellClass: 'font-medium',
    cell: (x) => x.name },
  { key: 'kind', label: 'Type', alwaysOn: true, weight: 1.8,
    sort: (x) => x.kindLabel, cell: (x) => x.kindLabel },
  { key: 'state', label: 'Status', alwaysOn: true, weight: 1.6,
    sort: (x) => x.state, cell: (x) => <StateBadge state={x.state} /> },
  { key: 'when', label: 'When', weight: 1.6, minWidth: 'md',
    sort: (x) => x.at ?? '', cell: (x) => fmtDate(x.at) },
  { key: 'by', label: 'By', weight: 1.8, minWidth: 'lg',
    sort: (x) => (x.by ?? '').toLowerCase(), cell: (x) => x.by || '—' },
];

function ItemDetail({ item, busy, onRestore, onClose }) {
  const href = archiveLinkFor(item);
  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={`${item.kindLabel}${item.detail ? ` · ${item.detail}` : ''}`}
      title={item.name}
      badges={<StateBadge state={item.state} />}
      actions={item.restorable || href ? (
        <>
          {item.restorable ? (
            <Button type="button" disabled={busy} onClick={onRestore}>
              <RotateCcw /> {busy ? 'Restoring…' : 'Restore'}
            </Button>
          ) : null}
          {href ? (
            <Link to={href} className={buttonVariants({ variant: 'outline' })}><ExternalLink /> Open on its screen</Link>
          ) : null}
        </>
      ) : null}
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">When</dt><dd>{fmtDate(item.at)}</dd></div>
        <div><dt className="text-muted-foreground">By</dt><dd>{item.by || '—'}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {item.restorable
          ? 'Restoring switches it back on: it appears again on its own screen and can be used as before.'
          : item.state === 'deleted'
            ? 'Deleted on purpose, so it cannot be restored. Create a new one if it is needed again.'
            : 'This kind of item cannot be switched back on from here yet.'}
      </p>
    </DetailPanel>
  );
}

export default function AdminArchivePage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(null);
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const view = useTableView('admin-archive', COLUMNS);

  const load = useCallback(async () => {
    setError(null);
    try { setItems(await adminAPI.getArchive()); } catch (err) { setError(err.message || 'Could not load archived items.'); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsLoading(true);
      load().finally(() => { if (!cancelled) setIsLoading(false); });
    });
    return () => { cancelled = true; };
  }, [load]);

  const kindOptions = useMemo(() => {
    const seen = new Map();
    for (const x of items) seen.set(x.kind, x.kindLabel);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const current = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];
    return view.sortRows(items.filter((x) => (!kind || x.kind === kind) && current.test(x)
      && (!q || `${x.name} ${x.detail ?? ''}`.toLowerCase().includes(q))));
  }, [items, kind, tab, search, view]);

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, items.filter(v.test).length])),
    [items],
  );

  const open = (item) => { setSelected(item); setNotice(null); };

  const restore = async () => {
    const fn = RESTORE[selected?.kind];
    if (!fn) return;
    setBusy(true); setError(null);
    try {
      await fn(selected.id);
      setNotice(`${selected.name} was restored.`);
      setSelected(null);
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <PageShell>
      <PageHeader
        title="Archive"
        description="Find deactivated or deleted records, and restore what can come back."
      />

      <ErrorBanner className="mt-4" message={error} onRetry={load} />
      {notice ? <p role="status" className="mt-4 rounded-lg border bg-good-soft px-4 py-3 text-sm text-good">{notice}</p> : null}

      <ViewTabs
        className="mt-5"
        label="Archive views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          header={
            <ListToolbar
              search={{ value: search, onChange: setSearch, placeholder: 'Search by name' }}
              // Only the kinds present, one at a time.
              filters={kindOptions.length > 1 ? kindOptions.map((o) => ({
                key: o.value, label: o.label, active: kind === o.value,
                onToggle: () => setKind((cur) => (cur === o.value ? null : o.value)),
              })) : []}
              onClearAll={() => { setKind(null); setSearch(''); }}
              columns={{
                idPrefix: 'admin-archive',
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
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Archive}
              title={items.length ? 'Nothing matches' : 'Nothing archived'}
              description={items.length ? 'Try another search or type.' : 'Deactivated and deleted records appear here.'}
              action={search || kind ? { label: 'Clear all filters', onClick: () => { setKind(null); setSearch(''); } } : undefined}
            />
          ) : (
            <MasterDataTable
              columns={view.visibleColumns}
              rows={visible}
              rowKey={(x) => `${x.kind}-${x.id}`}
              sort={view.sort}
              onToggleSort={view.toggleSort}
              onOpenRow={open}
              noun="items"
            />
          )}
        </ListCard>
      </div>

      {selected ? (
        <ItemDetail
          key={`${selected.kind}-${selected.id}`}
          item={selected}
          busy={busy}
          onRestore={restore}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </PageShell>
  );
}
