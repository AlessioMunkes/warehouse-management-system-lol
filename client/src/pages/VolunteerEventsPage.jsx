/**
 * VolunteerEventsPage — Volunteer Event List & Management
 *
 * This page displays all volunteer events in a table format and provides
 * the main management interface for coordinators. From here, users can:
 *   - View all events with their dates and statuses
 *   - Create new volunteer events
 *   - Edit existing events (only if not completed/cancelled)
 *   - Mark events as completed or cancel them
 *   - Navigate to a single event's workspace for detailed management
 *
 * Access is restricted to users with MANAGERS_UP (routes/permissions.js).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Pencil, Plus, XCircle } from 'lucide-react';
import EventFormDialog from '../features/volunteerManagement/components/EventFormDialog';
import volunteerManagementAPI from '../services/volunteerManagementAPI';
import { VOLUNTEERS } from '../routes/paths';
import StatusBadge from '@/components/ui/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import TablePager from '@/components/ui/table-pager';
import SortableHead from '@/components/ui/sortable-head';
import { compareValues } from '@/lib/useSortable';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/hooks/usePaged';

// Terminal events remain visible for history, but no longer expose edit or
// lifecycle actions that would be invalid after completion/cancellation.
const terminalStatuses = new Set(['COMPLETED', 'CANCELLED']);
const openStatuses = new Set(['DRAFT', 'SCHEDULED', 'PUBLISHED']);

const displayDate = (value) => {
  if (!value) return 'Date not set';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const eventDateValue = (event) => String(event.eventDate ?? '').slice(0, 10);

// Status sorts by where an event is in its life, not alphabetically.
const STATUS_ORDER = { DRAFT: 0, SCHEDULED: 1, PUBLISHED: 2, COMPLETED: 3, CANCELLED: 4 };
const EVENT_SORT = {
  name: (e) => String(e.name ?? '').toLowerCase(),
  date: (e) => eventDateValue(e) || '9999-12-31',
  status: (e) => STATUS_ORDER[e.status] ?? 9,
};

const eventSearchText = (event) => [
  event.name,
  event.venueName,
  event.address,
  event.description,
].join(' ').toLowerCase();

// The tabs. `id` is what goes in ?status=; All is the default and
// leaves the URL bare.
const VIEWS = [
  { id: 'all',       label: 'All',       test: () => true },
  { id: 'open',      label: 'Open',      test: (e) => openStatuses.has(e.status) },
  { id: 'completed', label: 'Completed', test: (e) => e.status === 'COMPLETED' },
  { id: 'cancelled', label: 'Cancelled', test: (e) => e.status === 'CANCELLED' },
];
const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

const shortDate = (value) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' })
  .format(new Date(`${value}T00:00:00`));

export default function VolunteerEventsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewById(searchParams.get('status'));
  const [events, setEvents] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [spaces, setSpaces] = useState([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  // Which column the table is sorted by. Date is the default and is the
  // same setting as the Sort dropdown; Event and Status come from
  // clicking their column names.
  const [sortKey, setSortKey] = useState('date');

  // Search and dates narrow every tab; the tab counts follow them.
  const narrowedEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      const date = eventDateValue(event);
      if (query && !eventSearchText(event).includes(query)) return false;
      if (fromDate && (!date || date < fromDate)) return false;
      if (toDate && (!date || date > toDate)) return false;
      return true;
    });
  }, [events, fromDate, search, toDate]);

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, narrowedEvents.filter(v.test).length])),
    [narrowedEvents],
  );

  const visibleEvents = useMemo(() => {
    return narrowedEvents
      .filter(view.test)
      .sort((a, b) => {
        const by = EVENT_SORT[sortKey] ?? EVENT_SORT.date;
        const c = compareValues(by(a), by(b));
        return sortDirection === 'asc' ? c : -c;
      });
  }, [narrowedEvents, sortDirection, sortKey, view]);

  // Click a column name: sort by it, again to flip the order, a third
  // time to go back to how the page opened (earliest date first).
  const toggleSort = (key) => {
    if (key !== sortKey) { setSortKey(key); setSortDirection('asc'); return; }
    if (sortDirection === 'asc') { setSortDirection('desc'); return; }
    setSortKey('date');
    setSortDirection('asc');
  };
  const tableSort = { key: sortKey, dir: sortDirection };

  // Events, fifteen to a page.
  const eventPage = usePaged(visibleEvents, TABLE_PAGE_SIZE, `${visibleEvents.length}|${sortKey}|${sortDirection}|${search}|${view.id}`);
  const narrowed = Boolean(search || fromDate || toDate);

  const clearFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
  };

  const changeView = (id) => setSearchParams(id === 'all' ? {} : { status: id }, { replace: true });

  // The date range as chips beside the search, removable one at a time.
  const dateChips = [
    fromDate ? { key: 'from', label: `From ${shortDate(fromDate)}`, onRemove: () => setFromDate('') } : null,
    toDate ? { key: 'to', label: `To ${shortDate(toDate)}`, onRemove: () => setToDate('') } : null,
  ].filter(Boolean);

  const sortNote = sortKey === 'date'
    ? `Sorted by date, ${sortDirection === 'asc' ? 'earliest' : 'latest'} first`
    : `Sorted by ${sortKey === 'name' ? 'event' : 'status'}${sortDirection === 'desc' ? ', reversed' : ''}`;

  // Shared reload path used after mutations and by the visible retry action.
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setEvents(await volunteerManagementAPI.getEvents());
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    volunteerManagementAPI.getEvents()
      .then((result) => { if (!cancelled) setEvents(result); })
      .catch((err) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true);
    setSpacesError('');
    try {
      setSpaces(await volunteerManagementAPI.getSpaces());
    } catch (err) {
      setSpacesError(err.message);
    } finally {
      setSpacesLoading(false);
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFormError('');
    setFormOpen(true);
    loadSpaces();
  };

  const openEdit = async (event) => {
    setBusy(true);
    setFormError('');
    setActionError('');
    try {
      const config = await volunteerManagementAPI.getEventBooking(event.id);
      setEditing({ ...config.event, timeslots: config.timeslots });
      setFormOpen(true);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // The dialog serves both creation and editing; refresh the list only after
  // the API mutation succeeds so failed input stays available to the user.
  const saveEvent = async (payload) => {
    setBusy(true);
    setFormError('');
      try {
      let created = null;
      if (editing) {
        if (Object.keys(payload.event ?? {}).length > 0) {
          await volunteerManagementAPI.updateEvent(editing.id, payload.event);
        }
        if (payload.timeslot) {
          await volunteerManagementAPI.updateTimeslot(editing.id, payload.timeslot.timeslotId, payload.timeslot.changes);
        }
      } else {
        created = await volunteerManagementAPI.createEventWithInitialTimeslot(payload);
      }
      setFormOpen(false);
      setEditing(null);
      await loadEvents();
      if (created?.event?.id) navigate(VOLUNTEERS.event(created.event.id));
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Destructive lifecycle changes are intentionally confirmed in one dialog.
  const confirmAction = async () => {
    if (!pendingAction) return;
    setBusy(true);
    setActionError('');
    try {
      if (pendingAction.type === 'cancel') {
        await volunteerManagementAPI.cancelEvent(pendingAction.event.id);
      } else {
        await volunteerManagementAPI.completeEvent(pendingAction.event.id);
      }
      setPendingAction(null);
      await loadEvents();
    } catch (err) {
      setPendingAction(null);
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Volunteer events"
        description="Create volunteer events, manage sign-ups and record attendance."
        actions={<Button type="button" onClick={openCreate}><Plus /> Create event</Button>}
      />

      <ErrorBanner className="mt-4" message={loadError} onRetry={loadEvents} />
      <ErrorBanner className="mt-4" message={actionError} />

      <ViewTabs
        className="mt-5"
        label="Event views"
        value={view.id}
        onChange={changeView}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          header={
            <ListToolbar
              search={{ value: search, onChange: setSearch, placeholder: 'Search events' }}
              chips={dateChips}
              onClearAll={clearFilters}
              note={sortNote}
            >
              <Input
                type="date" aria-label="From date" title="From date" className="h-8 w-auto"
                value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date" aria-label="To date" title="To date" className="h-8 w-auto"
                value={toDate} onChange={(e) => setToDate(e.target.value)}
              />
            </ListToolbar>
          }
          footer={!isLoading && visibleEvents.length ? <TablePager {...eventPage} noun="events" alwaysShow /> : null}
        >
          {isLoading ? (
            <div role="status" aria-label="Loading volunteer events" className="space-y-2 p-4">
              {[1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-10 w-full" />)}
            </div>
          ) : loadError ? null : events.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No volunteer events yet"
              description="Create the first event to get started."
              action={{ label: 'Create event', onClick: openCreate }}
            />
          ) : visibleEvents.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={narrowed ? 'No events match your filters' : 'Nothing in this view'}
              description={narrowed ? 'Adjust the search or dates to see more events.' : 'No event is in this state right now.'}
              action={narrowed ? { label: 'Clear all filters', onClick: clearFilters } : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Event" sortKey="name" sort={tableSort} onSort={toggleSort} />
                  <SortableHead label="Date" sortKey="date" sort={tableSort} onSort={toggleSort} />
                  <SortableHead label="Status" sortKey="status" sort={tableSort} onSort={toggleSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventPage.slice.map((event) => {
                  const terminal = terminalStatuses.has(event.status);
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="max-w-md whitespace-normal">
                        <button type="button" className="text-left font-medium hover:underline" onClick={() => navigate(VOLUNTEERS.event(event.id))}>
                          {event.name}
                        </button>
                        {event.venueName && (
                          <p className="text-xs text-muted-foreground">{event.venueName}{event.address ? ` (${event.address})` : ''}</p>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{displayDate(event.eventDate)}</TableCell>
                      <TableCell><StatusBadge kind="volunteerEvent" status={event.status}>{event.statusLabel}</StatusBadge></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Link to={VOLUNTEERS.event(event.id)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Open</Link>
                          {!terminal && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${event.name}`} title="Edit" onClick={() => openEdit(event)}><Pencil /></Button>}
                          {!terminal && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Complete ${event.name}`} title="Mark completed" onClick={() => setPendingAction({ type: 'complete', event })}><CheckCircle2 /></Button>}
                          {!terminal && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Cancel ${event.name}`} title="Cancel event" onClick={() => setPendingAction({ type: 'cancel', event })}><XCircle /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ListCard>
      </div>

      {formOpen && (
        <EventFormDialog
          key={editing?.id ?? 'new'}
          open={formOpen}
          event={editing}
          busy={busy}
          error={formError}
          spaces={spaces}
          spacesLoading={spacesLoading}
          spacesError={spacesError}
          onRetrySpaces={loadSpaces}
          onValidateTime={volunteerManagementAPI.validateTimeslot}
          onOpenChange={setFormOpen}
          onSubmit={saveEvent}
        />
      )}

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => !busy && !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.type === 'cancel' ? 'Cancel event?' : 'Complete event?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === 'cancel'
                ? `This will cancel ${pendingAction?.event.name}.`
                : `This will mark ${pendingAction?.event.name} as completed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep event</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmAction}>
              {pendingAction?.type === 'cancel' ? 'Cancel event' : 'Complete event'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
