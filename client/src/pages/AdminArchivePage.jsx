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
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import adminAPI from '../services/adminAPI';
import { archiveLinkFor } from '../features/admin/recordLinks';
import { setUserStatus } from '../services/userAPI';
import { setProductStatus } from '../services/productAPI';
import { setSupplierStatus } from '../services/supplierAPI';
import { setBeneficiaryStatus } from '../services/beneficiaryAPI';
import useDetailFocus  from '../features/masterdata/hooks/useDetailFocus';
import useTableView    from '../features/masterdata/hooks/useTableView';
import MasterDataTable from '../features/masterdata/components/MasterDataTable';
import ColumnToggle    from '../features/masterdata/components/ColumnToggle';
import FilterPills     from '../features/masterdata/components/FilterPills';
import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Button, buttonVariants } from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Search, X, RotateCcw, ExternalLink } from 'lucide-react';

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

const STATE_FILTERS = [
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'deleted', label: 'Deleted' },
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

const ErrorBanner = ({ message, onRetry }) => (
  <div className="p-4 rounded-[4px] bg-danger-soft border-2 border-brand text-ink text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    {onRetry ? (
      <button onClick={onRetry} className="text-xs sm:text-sm font-semibold underline hover:text-brand focus:outline-none">Try again</button>
    ) : null}
  </div>
);

function ItemDetail({ item, busy, onRestore, onClose }) {
  const href = archiveLinkFor(item);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{item.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{item.kindLabel}{item.detail ? ` · ${item.detail}` : ''}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close"><X /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Status</dt><dd><StateBadge state={item.state} /></dd></div>
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
        <div className="flex flex-wrap gap-2">
          {item.restorable ? (
            <Button type="button" disabled={busy} onClick={onRestore}>
              <RotateCcw /> {busy ? 'Restoring…' : 'Restore'}
            </Button>
          ) : null}
          {href ? (
            <Link to={href} className={buttonVariants({ variant: 'outline' })}><ExternalLink /> Open on its screen</Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminArchivePage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(null);
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [detailRef, focusDetail] = useDetailFocus();
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
    return view.sortRows(items.filter((x) => (!kind || x.kind === kind) && (!state || x.state === state)
      && (!q || `${x.name} ${x.detail ?? ''}`.toLowerCase().includes(q))));
  }, [items, kind, state, search, view]);

  const counts = useMemo(() => ({
    deactivated: items.filter((x) => x.state === 'deactivated').length,
    deleted: items.filter((x) => x.state === 'deleted').length,
  }), [items]);

  const open = (item) => { setSelected(item); setNotice(null); focusDetail(); };

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
    <ManagerLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Archive</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything switched off or deleted across the system.
          {items.length ? ` ${counts.deactivated} deactivated, ${counts.deleted} deleted.` : ''}
        </p>

        {error ? <div className="mt-4"><ErrorBanner message={error} onRetry={load} /></div> : null}
        {notice ? <p role="status" className="mt-4 text-sm font-medium">{notice}</p> : null}

        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="min-w-56 flex-1">
              <InputGroupAddon align="inline-start"><Search /></InputGroupAddon>
              <InputGroupInput placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
            </InputGroup>
            <FilterPills label="Filter by status" value={state} onChange={setState} options={STATE_FILTERS} />
            <ColumnToggle idPrefix="admin-archive" columns={view.availableColumns} hidden={view.hidden}
              onToggle={view.toggleColumn} onReset={view.resetColumns} />
          </div>
          {kindOptions.length > 1 ? (
            <FilterPills label="Filter by type" value={kind} onChange={setKind} options={kindOptions} />
          ) : null}

          <div ref={detailRef} tabIndex={-1} className="scroll-mt-6 outline-none">
            {selected ? <ItemDetail item={selected} busy={busy} onRestore={restore} onClose={() => setSelected(null)} /> : null}
          </div>

          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{items.length ? 'Nothing matches.' : 'Nothing has been deactivated or deleted.'}</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <MasterDataTable
                  columns={view.visibleColumns}
                  rows={visible}
                  rowKey={(x) => `${x.kind}-${x.id}`}
                  sort={view.sort}
                  onToggleSort={view.toggleSort}
                  onOpenRow={open}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </ManagerLayout>
  );
}
