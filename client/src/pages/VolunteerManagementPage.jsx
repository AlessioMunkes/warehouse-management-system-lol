// ─────────────────────────────────────────────────────────────
// client/src/pages/VolunteerManagementPage.jsx
//
// The guest log: every time somebody signed in at the door.
//
// The data was already there. POST /api/volunteers/sign-in has been
// writing a row per arrival since guest login went in — name, source,
// signed_in_at — and nothing has ever read it back. So this screen is
// mostly a read, not a new capture: what it adds is the ability to see
// the log at all, and to close a visit.
//
// CLOSING A VISIT IS THE PART THAT WAS MISSING
// signed_out_at has three readers and, until now, no writer. The
// volunteer-hours figure in Reporting sums signed_out_at minus
// signed_in_at, which means it has always returned nothing. Signing
// somebody out here is what starts filling that in.
//
// WHY THIS DOES NOT HAVE A DELETE BUTTON
// Every other screen under Master data got one. This one should not:
// a guest log is a record of who was on site, which is a safety and
// accountability question before it is a data-tidiness one, and an
// attendance record that can be quietly removed is not an attendance
// record. Nothing here creates or edits either — the door creates the
// rows.
//
// Same sortable, filterable, collapsible table as the other three, so
// there is one of everything rather than four.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import volunteerAPI  from '../services/volunteerAPI';
import useDetailFocus  from '../features/masterdata/hooks/useDetailFocus';
import useTableView    from '../features/masterdata/hooks/useTableView';
import MasterDataTable from '../features/masterdata/components/MasterDataTable';
import ColumnToggle    from '../features/masterdata/components/ColumnToggle';
import FilterPills     from '../features/masterdata/components/FilterPills';

import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Input }    from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Search, LogOut, X } from 'lucide-react';

const SAST = 'Africa/Johannesburg';

// Warehouse time, always. A timestamptz rendered in the reader's own
// zone would put a 09:00 arrival at 07:00 for anyone looking from the
// UK, and this is a record of what happened at a building in Cape Town.
const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: SAST,
  });
};

// Minutes into something a person reads without doing arithmetic.
const fmtDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const STATUS_FILTERS = [
  { value: 'open',   label: 'On site' },
  { value: 'closed', label: 'Signed out' },
];

const COLUMNS = [
  { key: 'name',      label: 'Name', alwaysOn: true, weight: 3,
    sort: (v) => (v.fullName ?? '').toLowerCase(),
    cellClass: 'font-medium',
    cell: (v) => v.fullName },
  { key: 'signedIn',  label: 'Signed in', weight: 2.4,
    // Sorting on the raw ISO string, not the formatted one: "9 Sep"
    // sorts before "10 Aug" as text, and an arrival log that cannot be
    // ordered by time is not a log.
    sort: (v) => v.signedInAt ?? '',
    cell: (v) => fmtDateTime(v.signedInAt) },
  { key: 'signedOut', label: 'Signed out', weight: 2.4, minWidth: 'md',
    sort: (v) => v.signedOutAt ?? '',
    cell: (v) => fmtDateTime(v.signedOutAt) },
  { key: 'duration',  label: 'On site', numeric: true, weight: 1.5, minWidth: 'sm',
    sort: (v) => (v.minutesOnSite ?? null),
    cell: (v) => fmtDuration(v.minutesOnSite) },
  { key: 'source',    label: 'Source', weight: 1.8, minWidth: 'lg',
    sort: (v) => (v.source ?? '').toLowerCase(),
    cell: (v) => v.source || '—' },
  { key: 'status',    label: '', sort: null, alwaysOn: true, weight: 1.8,
    cell: (v) => (v.signedOutAt ? null : <Badge variant="outline">On site</Badge>) },
];

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

const VisitDetail = ({ visit, busy, onSignOut, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>{visit.fullName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {visit.signedOutAt ? 'Visit closed' : 'On site now'}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
        <X />
      </Button>
    </CardHeader>

    <CardContent className="space-y-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Signed in</dt><dd>{fmtDateTime(visit.signedInAt)}</dd></div>
        <div><dt className="text-muted-foreground">Signed out</dt><dd>{fmtDateTime(visit.signedOutAt)}</dd></div>
        <div><dt className="text-muted-foreground">Time on site</dt><dd>{fmtDuration(visit.minutesOnSite)}</dd></div>
        <div><dt className="text-muted-foreground">Source</dt><dd>{visit.source || '—'}</dd></div>
      </dl>

      {/* Only an open visit can be closed. A signed-out visit shows no
          button at all rather than a disabled one: there is nothing to
          do, and a greyed control invites a hunt for the reason. */}
      {!visit.signedOutAt ? (
        <Button type="button" variant="outline" disabled={busy} onClick={onSignOut}>
          <LogOut />
          Sign out
        </Button>
      ) : null}
    </CardContent>
  </Card>
);

export default function VolunteerManagementPage() {
  const [visits, setVisits] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [selected, setSelected] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [detailRef, focusDetail] = useDetailFocus();
  const view = useTableView('volunteers', COLUMNS);

  const visibleVisits = useMemo(() => {
    const filtered = statusFilter
      ? visits.filter((v) => (statusFilter === 'open' ? !v.signedOutAt : Boolean(v.signedOutAt)))
      : visits;
    return view.sortRows(filtered);
  }, [visits, statusFilter, view]);

  const onSiteCount = useMemo(
    () => visits.filter((v) => !v.signedOutAt).length,
    [visits],
  );

  const loadVisits = useCallback(async () => {
    setError(null);
    try {
      setVisits(await volunteerAPI.getGuestLog({ search, from, to }));
    } catch (err) {
      setError(err.message || 'Could not load the guest log.');
    }
  }, [search, from, to]);

  // Same stale-response guard as the other master-data screens: a fast
  // keystroke would otherwise let an earlier reply overwrite a later one.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadVisits().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [loadVisits]);

  const open = (visit) => { setSelected(visit); focusDetail(); };

  const signOut = async () => {
    setBusy(true); setError(null);
    try {
      const updated = await volunteerAPI.signOutVisit(selected.id);
      setSelected(updated);
      await loadVisits();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Volunteer Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has signed in at the door.
          {onSiteCount > 0
            ? ` ${onSiteCount} ${onSiteCount === 1 ? 'person is' : 'people are'} on site now.`
            : ''}
        </p>

        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} onRetry={loadVisits} />
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          {/* Outside the isLoading check, same as the other three: this
              block triggers the fetch, and swapping it for a skeleton
              on every keystroke destroys the input mid-type and steals
              focus after each letter. */}
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="min-w-56 flex-1">
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>

            <div className="flex items-center gap-2">
              <label htmlFor="log-from" className="text-sm text-muted-foreground">From</label>
              <Input
                id="log-from" type="date" className="w-auto"
                value={from} onChange={(e) => setFrom(e.target.value)}
              />
              <label htmlFor="log-to" className="text-sm text-muted-foreground">to</label>
              <Input
                id="log-to" type="date" className="w-auto"
                value={to} onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <FilterPills
              label="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_FILTERS}
            />

            <ColumnToggle
              idPrefix="volunteers"
              columns={view.availableColumns}
              hidden={view.hidden}
              onToggle={view.toggleColumn}
              onReset={view.resetColumns}
            />
          </div>

          <div ref={detailRef} tabIndex={-1} className="scroll-mt-6 outline-none">
            {selected ? (
              <VisitDetail
                visit={selected}
                busy={busy}
                onSignOut={signOut}
                onClose={() => setSelected(null)}
              />
            ) : null}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : visibleVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-ins match.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <MasterDataTable
                  columns={view.visibleColumns}
                  rows={visibleVisits}
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
