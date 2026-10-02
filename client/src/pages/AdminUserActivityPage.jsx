// ─────────────────────────────────────────────────────────────
// client/src/pages/AdminUserActivityPage.jsx
//
// User Activity (admin): a timeline of what everyone did, with filters by
// person, area and date. Click an entry for details; "Open the record"
// goes to the slip, order or supplier itself. Read-only.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import adminAPI from '../services/adminAPI';
import { linkFor } from '../features/admin/recordLinks';
import useDetailFocus  from '../features/masterdata/hooks/useDetailFocus';
import useTableView    from '../features/masterdata/hooks/useTableView';
import MasterDataTable from '../features/masterdata/components/MasterDataTable';
import ColumnToggle    from '@/components/ui/column-toggle';
import FilterPills     from '../features/masterdata/components/FilterPills';
import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Input }    from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Search, X, ExternalLink } from 'lucide-react';

const SAST = 'Africa/Johannesburg';
const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', warehouse_worker: 'Warehouse staff' };

const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: SAST,
  });
};

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const COLUMNS = [
  { key: 'when', label: 'When', alwaysOn: true, weight: 2.2,
    sort: (e) => e.at ?? '',
    cell: (e) => fmtDateTime(e.at) },
  { key: 'who', label: 'Who', alwaysOn: true, weight: 2.2,
    sort: (e) => (e.actor?.name ?? 'System').toLowerCase(),
    cellClass: 'font-medium',
    cell: (e) => e.actor?.name ?? <span className="text-muted-foreground">System</span> },
  { key: 'what', label: 'What they did', alwaysOn: true, weight: 5,
    sort: (e) => e.text.toLowerCase(),
    cell: (e) => e.text },
  { key: 'area', label: 'Area', weight: 1.6, minWidth: 'md',
    sort: (e) => e.area,
    cell: (e) => <Badge variant="outline">{e.area}</Badge> },
  { key: 'role', label: 'Role', weight: 1.6, minWidth: 'lg',
    sort: (e) => e.actor?.role ?? '',
    cell: (e) => (e.actor?.role ? ROLE_LABELS[e.actor.role] ?? e.actor.role : '—') },
];

const ErrorBanner = ({ message, onRetry }) => (
  <div className="p-4 rounded-[4px] bg-danger-soft border-2 border-brand text-ink text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    {onRetry ? (
      <button onClick={onRetry} className="text-xs sm:text-sm font-semibold underline hover:text-brand focus:outline-none">
        Try again
      </button>
    ) : null}
  </div>
);

// The fields worth showing from an audit entry's before/after, without
// dumping JSON on the admin: only what changed.
const changesOf = (detail) => {
  const before = detail?.before ?? {};
  const after = detail?.after ?? {};
  return Object.keys({ ...before, ...after })
    .filter((k) => !/(_at|_id|^id)$/.test(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .slice(0, 8)
    .map((k) => ({ field: k.replace(/_/g, ' '), from: before[k], to: after[k] }));
};
const show = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function EntryDetail({ entry, onClose, onFilterPerson }) {
  const href = linkFor(entry.link);
  const changes = entry.source === 'audit' ? changesOf(entry.detail) : [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{entry.actor?.name ?? 'System'} {entry.text}</CardTitle>
          <p className="text-sm text-muted-foreground">{fmtDateTime(entry.at)} · {entry.area}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Who</dt><dd>{entry.actor ? `${entry.actor.name} (${entry.actor.username})` : 'The system, automatically'}</dd></div>
          <div><dt className="text-muted-foreground">Role</dt><dd>{entry.actor?.role ? ROLE_LABELS[entry.actor.role] ?? entry.actor.role : '—'}</dd></div>
          {entry.subject ? <div><dt className="text-muted-foreground">Record</dt><dd>{entry.subject}</dd></div> : null}
          {entry.detail?.reason ? <div><dt className="text-muted-foreground">Reason</dt><dd>{entry.detail.reason}</dd></div> : null}
        </dl>

        {changes.length > 0 ? (
          <div>
            <p className="mb-1 text-sm font-medium">What changed</p>
            <ul className="space-y-1 text-sm">
              {changes.map((c) => (
                <li key={c.field}>
                  <span className="text-muted-foreground">{c.field}:</span> {show(c.from)} → <strong>{show(c.to)}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {href ? (
            <Link to={href} className={buttonVariants({ variant: 'outline' })}>
              <ExternalLink /> Open the record
            </Link>
          ) : null}
          {entry.actor ? (
            <Button type="button" variant="ghost" onClick={() => onFilterPerson(String(entry.actor.id))}>
              Show only {entry.actor.name}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminUserActivityPage() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(() => isoDaysAgo(29));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [person, setPerson] = useState('');
  const [area, setArea] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Everyone active in the period, kept from the unfiltered load so the
  // person picker still lists them all while one is selected.
  const [everyone, setEveryone] = useState([]);

  const [detailRef, focusDetail] = useDetailFocus();
  const view = useTableView('admin-activity', COLUMNS);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminAPI.getActivity({ from, to, user: person || undefined });
      setData(res);
      if (!person) setEveryone(res.people ?? []);
    } catch (err) {
      setError(err.message || 'Could not load the activity log.');
    }
  }, [from, to, person]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsLoading(true);
      load().finally(() => { if (!cancelled) setIsLoading(false); });
    });
    return () => { cancelled = true; };
  }, [load]);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = entries.filter((e) => (!area || e.area === area)
      && (!q || `${e.actor?.name ?? 'system'} ${e.text} ${e.subject ?? ''}`.toLowerCase().includes(q)));
    return view.sortRows(filtered);
  }, [entries, area, search, view]);

  // Everyone who did anything in the period, busiest first — the list
  // for the person picker and the summary line.
  const people = data?.people ?? [];
  const areaOptions = (data?.areas ?? []).map((a) => ({ value: a, label: a }));

  const open = (entry) => { setSelected(entry); focusDetail(); };
  const filterPerson = (id) => { setPerson(id); setSelected(null); };

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-medium">User Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything people did in the system, newest first.
          {data ? ` ${entries.length} ${entries.length === 1 ? 'action' : 'actions'} by ${people.length} ${people.length === 1 ? 'person' : 'people'} from ${data.from} to ${data.to}.` : ''}
          {data?.truncated ? ' Showing the latest 2 000; narrow the dates to see earlier ones.' : ''}
        </p>

        {error ? <div className="mt-4"><ErrorBanner message={error} onRetry={load} /></div> : null}

        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="min-w-56 flex-1">
              <InputGroupAddon align="inline-start"><Search /></InputGroupAddon>
              <InputGroupInput placeholder="Search people, actions or records" value={search} onChange={(e) => setSearch(e.target.value)} />
            </InputGroup>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Person</span>
              <select value={person} onChange={(e) => filterPerson(e.target.value)}
                className="h-9 rounded-full border border-input bg-transparent px-3 text-sm">
                <option value="">Everyone</option>
                {(everyone.length ? everyone : people).filter((p) => p.id !== 'system').map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name} ({p.count})</option>
                ))}
                <option value="system">The system (automatic)</option>
              </select>
            </label>

            <div className="flex items-center gap-2">
              <label htmlFor="act-from" className="text-sm text-muted-foreground">From</label>
              <Input id="act-from" type="date" className="w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <label htmlFor="act-to" className="text-sm text-muted-foreground">to</label>
              <Input id="act-to" type="date" className="w-auto" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>

            <ColumnToggle idPrefix="admin-activity" columns={view.availableColumns} hidden={view.hidden}
              onToggle={view.toggleColumn} onReset={view.resetColumns} />
          </div>

          {areaOptions.length > 1 ? (
            <FilterPills label="Filter by area" value={area} onChange={setArea} options={areaOptions} />
          ) : null}

          {/* The busiest people this period, one tap to see just theirs. */}
          {!person && people.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Most active:</span>
              {people.slice(0, 6).map((p) => (
                <button key={p.id} type="button" onClick={() => filterPerson(String(p.id))}
                  className="rounded-full border px-2.5 py-1 hover:bg-muted">
                  {p.name} · {p.count}
                </button>
              ))}
            </div>
          ) : null}

          <div ref={detailRef} tabIndex={-1} className="scroll-mt-6 outline-none">
            {selected ? (
              <EntryDetail entry={selected} onClose={() => setSelected(null)} onFilterPerson={filterPerson} />
            ) : null}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity matches.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <MasterDataTable
                  columns={view.visibleColumns}
                  rows={visible}
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
