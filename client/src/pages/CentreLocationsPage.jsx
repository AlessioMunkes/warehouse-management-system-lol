// ─────────────────────────────────────────────────────────────
// CentreLocationsPage.jsx
//
// The admin's list of where each beneficiary centre is: its address,
// suburb and pin, for the manager's Impact map. Open a centre to type
// its address and place its pin (features/impactMap/
// CentreLocationPanel.jsx). Nothing else about a centre is changed here;
// that is the manager's Beneficiaries screen.
//
// "Needs a location" is the work list: a centre with no pin is counted on
// the Impact map but not drawn on it. "Suburb only" are pins found by
// research that mark the middle of a suburb, not the building, so they
// are worth checking.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, MapPinOff } from 'lucide-react';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import StatusBadge from '@/components/ui/status-badge';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TablePager from '@/components/ui/table-pager';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/usePaged';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';
import { useToast } from '@/components/ui/toastContext';
import { formatShortDate } from '@/lib/dates';
import { listCentreLocations, setCentreLocation } from '../services/impactMapAPI';
import CentreLocationPanel from '../features/impactMap/CentreLocationPanel';
import { SOURCE_LABEL, cohortLabel } from '../features/impactMap/impactView';

const placed = (c) => c.lat !== null && c.lng !== null;
const suburbOnly = (c) => placed(c) && /middle of the suburb/i.test(c.note ?? '');

const VIEWS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'missing', label: 'Needs a location', alert: true, test: (c) => c.isActive && !placed(c) },
  { id: 'suburb', label: 'Suburb only', test: suburbOnly },
  { id: 'placed', label: 'Placed', test: placed },
];

// Every column but the centre can be hidden.
const COLUMNS = [
  { key: 'centre', label: 'Centre', alwaysOn: true },
  { key: 'cohort', label: 'Cohort' },
  { key: 'suburb', label: 'Suburb' },
  { key: 'address', label: 'Address' },
  { key: 'pin', label: 'Pin' },
  { key: 'updated', label: 'Updated' },
];

const FILTERS = [
  { key: 'cohort', label: 'Cohort', valueOf: (c) => c.cohort, labelOf: cohortLabel },
  { key: 'source', label: 'Pin', valueOf: (c) => (placed(c) ? c.source : 'none'), labelOf: (v) => (v === 'none' ? 'No pin' : SOURCE_LABEL[v] ?? v) },
  { key: 'status', label: 'Status', valueOf: (c) => (c.isActive ? 'active' : 'inactive'), labelOf: (v) => (v === 'active' ? 'Active' : 'Inactive') },
];

function PinBadge({ centre }) {
  if (!placed(centre)) return <StatusBadge tone="bad">No pin</StatusBadge>;
  if (suburbOnly(centre)) return <StatusBadge tone="warn">Suburb only</StatusBadge>;
  return <StatusBadge tone="good">{centre.source === 'manual' ? 'Placed' : 'Found'}</StatusBadge>;
}

export default function CentreLocationsPage() {
  const toast = useToast();
  const [centres, setCentres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('missing');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCentres(await listCentreLocations());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || 'Could not load the centre locations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCentreLocations()
      .then((rows) => { if (!cancelled) { setCentres(rows); setLoadError(null); } })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Could not load the centre locations.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, centres.filter(v.test).length])), [centres]);
  const tableView = useTableView('centreLocations', COLUMNS);
  const show = tableView.isVisible;
  const listFilters = useListFilters(FILTERS, centres);
  const { apply: applyFilters } = listFilters;
  const visible = useMemo(() => {
    const v = VIEWS.find((x) => x.id === view) ?? VIEWS[0];
    const q = search.trim().toLowerCase();
    return applyFilters(centres).filter((c) => v.test(c)
      && (!q || `${c.name} ${c.suburb ?? ''} ${c.address ?? ''}`.toLowerCase().includes(q)));
  }, [centres, view, search, applyFilters]);
  const page = usePaged(visible, TABLE_PAGE_SIZE, `${visible.length}|${view}|${search}`);
  const open = centres.find((c) => c.id === openId) ?? null;

  const save = async (body) => {
    setSaving(true);
    try {
      const saved = await setCentreLocation(open.id, body);
      setCentres((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      setOpenId(null);
      toast({ variant: 'success', title: `Saved ${saved.name}`, description: placed(saved) ? 'It shows on the Impact map.' : 'It has no pin, so it is not on the Impact map.' });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not save the location', description: err.message || 'Nothing was changed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader title="Centre locations" description="Set where each centre is so managers see it on the Impact map." />

      {loadError ? <div className="mt-4"><ErrorBanner message={loadError} onRetry={load} /></div> : null}

      <ViewTabs
        className="mt-5"
        label="Centre location views"
        value={view}
        onChange={setView}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: loading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          header={(
            <ListToolbar
              search={{ value: search, onChange: setSearch, placeholder: 'Search by centre, suburb or address' }}
              filters={listFilters.filters}
              onClearAll={() => { setSearch(''); listFilters.clear(); }}
              columns={{
                idPrefix: 'centre-locations',
                columns: tableView.availableColumns,
                hidden: tableView.hidden,
                onToggle: tableView.toggleColumn,
                onReset: tableView.resetColumns,
              }}
            />
          )}
          footer={!loading && visible.length ? <TablePager {...page} noun="centres" alwaysShow /> : null}
        >
          {loading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={view === 'missing' ? MapPin : MapPinOff}
              title={view === 'missing' && !search ? 'Every active centre has a location' : 'No centres match'}
              description={search ? 'Nothing matches the search.' : 'Nothing is waiting here.'}
              action={search ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-5">Centre</TableHead>
                  {show('cohort') ? <TableHead>Cohort</TableHead> : null}
                  {show('suburb') ? <TableHead>Suburb</TableHead> : null}
                  {show('address') ? <TableHead>Address</TableHead> : null}
                  {show('pin') ? <TableHead>Pin</TableHead> : null}
                  {show('updated') ? <TableHead className="pr-4 sm:pr-5">Updated</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.slice.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 sm:pl-5">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => setOpenId(c.id)}>
                        {c.name}
                      </button>
                      {!c.isActive ? <span className="ml-2 text-xs text-muted-foreground">Inactive</span> : null}
                    </TableCell>
                    {show('cohort') ? <TableCell>{cohortLabel(c.cohort)}</TableCell> : null}
                    {show('suburb') ? <TableCell>{c.suburb || '-'}</TableCell> : null}
                    {show('address') ? <TableCell className="max-w-56 truncate">{c.address || '-'}</TableCell> : null}
                    {show('pin') ? <TableCell><PinBadge centre={c} /></TableCell> : null}
                    {show('updated') ? <TableCell className="pr-4 sm:pr-5">{c.updatedAt ? formatShortDate(c.updatedAt) : '-'}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListCard>
      </div>

      {open ? (
        <CentreLocationPanel key={open.id} centre={open} onSave={save} onClose={() => setOpenId(null)} isSaving={saving} />
      ) : null}
    </PageShell>
  );
}
