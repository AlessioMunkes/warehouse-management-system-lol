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
// there is one of everything rather than four. On site / Signed out are
// tabs; a visit opens in the panel down the right.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import volunteerAPI  from '../services/volunteerAPI';
import useTableView    from '../features/masterdata/hooks/useTableView';
import MasterDataTable from '../features/masterdata/components/MasterDataTable';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge  from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs     from '@/components/ui/view-tabs';
import ListCard     from '@/components/ui/list-card';
import ListToolbar  from '@/components/ui/list-toolbar';
import DetailPanel  from '@/components/ui/detail-panel';
import EmptyState   from '@/components/ui/empty-state';
import ErrorBanner  from '@/components/ui/error-banner';
import { LogOut, Users } from 'lucide-react';

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

const VIEWS = [
  { id: 'all',    label: 'All',        test: () => true },
  { id: 'open',   label: 'On site',    test: (v) => !v.signedOutAt },
  { id: 'closed', label: 'Signed out', test: (v) => Boolean(v.signedOutAt) },
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
    cell: (v) => (v.signedOutAt ? null : <StatusBadge kind="visit" status="on_site">On site</StatusBadge>) },
];

const VisitDetail = ({ visit, busy, onSignOut, onClose }) => (
  <DetailPanel
    open
    onClose={onClose}
    eyebrow="Visit"
    title={visit.fullName}
    badges={visit.signedOutAt
      ? <StatusBadge kind="visit" status="closed">Signed out</StatusBadge>
      : <StatusBadge kind="visit" status="on_site">On site</StatusBadge>}
    // Only an open visit can be closed. A signed-out visit shows no
    // button at all rather than a disabled one: there is nothing to do,
    // and a greyed control invites a hunt for the reason.
    actions={!visit.signedOutAt ? (
      <Button type="button" disabled={busy} onClick={onSignOut}>
        <LogOut />
        Sign out
      </Button>
    ) : null}
  >
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Signed in</dt><dd>{fmtDateTime(visit.signedInAt)}</dd></div>
      <div><dt className="text-muted-foreground">Signed out</dt><dd>{fmtDateTime(visit.signedOutAt)}</dd></div>
      <div><dt className="text-muted-foreground">Time on site</dt><dd>{fmtDuration(visit.minutesOnSite)}</dd></div>
      <div><dt className="text-muted-foreground">Source</dt><dd>{visit.source || '—'}</dd></div>
    </dl>
  </DetailPanel>
);

export default function VolunteerManagementPage() {
  const [visits, setVisits] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const view = useTableView('volunteers', COLUMNS);
  const current = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];

  const visibleVisits = useMemo(
    () => view.sortRows(visits.filter(current.test)),
    [visits, current, view],
  );

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, visits.filter(v.test).length])),
    [visits],
  );
  const onSiteCount = counts.open;

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
    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsLoading(true);
      loadVisits().finally(() => { if (!cancelled) setIsLoading(false); });
    });
    return () => { cancelled = true; };
  }, [loadVisits]);

  const open = (visit) => setSelected(visit);

  const dateChips = [
    from ? { key: 'from', label: `From ${from}`, onRemove: () => setFrom('') } : null,
    to ? { key: 'to', label: `To ${to}`, onRemove: () => setTo('') } : null,
  ].filter(Boolean);
  const clearAll = () => { setSearch(''); setFrom(''); setTo(''); };

  const signOut = async () => {
    setBusy(true); setError(null);
    try {
      const updated = await volunteerAPI.signOutVisit(selected.id);
      setSelected(updated);
      await loadVisits();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <PageShell>
      <PageHeader
        title="Volunteer log"
        description={`Everyone who has signed in at the door.${onSiteCount > 0
          ? ` ${onSiteCount} ${onSiteCount === 1 ? 'person is' : 'people are'} on site now.`
          : ''}`}
      />

      <ErrorBanner className="mt-4" message={error} onRetry={loadVisits} />

      <ViewTabs
        className="mt-5"
        label="Visit views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          // The toolbar stays mounted through a reload: it triggers the
          // fetch, and swapping it for a skeleton on every keystroke
          // destroys the input mid-type and steals focus.
          header={
            <ListToolbar
              search={{ value: search, onChange: setSearch, placeholder: 'Search by name' }}
              chips={dateChips}
              onClearAll={clearAll}
              columns={{
                idPrefix: 'volunteers',
                columns: view.availableColumns,
                hidden: view.hidden,
                onToggle: view.toggleColumn,
                onReset: view.resetColumns,
              }}
            >
              <Input
                type="date" aria-label="From date" title="From date" className="h-8 w-auto"
                value={from} onChange={(e) => setFrom(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date" aria-label="To date" title="To date" className="h-8 w-auto"
                value={to} onChange={(e) => setTo(e.target.value)}
              />
            </ListToolbar>
          }
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visibleVisits.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No sign-ins match"
              description={search || from || to ? 'Nothing matches the search or dates.' : 'Nobody is in this view.'}
              action={search || from || to ? { label: 'Clear all filters', onClick: clearAll } : undefined}
            />
          ) : (
            <MasterDataTable
              columns={view.visibleColumns}
              rows={visibleVisits}
              sort={view.sort}
              onToggleSort={view.toggleSort}
              onOpenRow={open}
              noun="visits"
            />
          )}
        </ListCard>
      </div>

      {selected ? (
        <VisitDetail
          key={selected.id}
          visit={selected}
          busy={busy}
          onSignOut={signOut}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </PageShell>
  );
}
