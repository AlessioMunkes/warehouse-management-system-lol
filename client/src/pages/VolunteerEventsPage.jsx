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
 * Access is restricted to users with VOLUNTEER_MANAGEMENT_ROLES.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Pencil, Plus, XCircle } from 'lucide-react';
import EventFormDialog from '../features/volunteerManagement/components/EventFormDialog';
import volunteerManagementAPI from '../services/volunteerManagementAPI';
import { VOLUNTEERS } from '../routes/paths';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Terminal events remain visible for history, but no longer expose edit or
// lifecycle actions that would be invalid after completion/cancellation.
const terminalStatuses = new Set(['COMPLETED', 'CANCELLED']);

const displayDate = (value) => {
  if (!value) return 'Date not set';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const ErrorBanner = ({ message, onRetry }) => (
  <div role="alert" className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    {onRetry && <Button type="button" variant="outline" onClick={onRetry}>Try again</Button>}
  </div>
);

export default function VolunteerEventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState('');

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

  const openCreate = () => {
    setEditing(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (event) => {
    setEditing(event);
    setFormError('');
    setFormOpen(true);
  };

  // The dialog serves both creation and editing; refresh the list only after
  // the API mutation succeeds so failed input stays available to the user.
  const saveEvent = async (payload) => {
    setBusy(true);
    setFormError('');
    try {
      if (editing) await volunteerManagementAPI.updateEvent(editing.id, payload);
      else await volunteerManagementAPI.createEvent(payload);
      setFormOpen(false);
      setEditing(null);
      await loadEvents();
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
    <div className="min-h-screen bg-white text-[#2b3336] font-['Montserrat',sans-serif]">
      <main className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Volunteer Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage volunteer events.</p>
          </div>
          <Button type="button" onClick={openCreate}><Plus /> Create event</Button>
        </div>

        {loadError && <div className="mb-4"><ErrorBanner message={loadError} onRetry={loadEvents} /></div>}
        {actionError && <div className="mb-4"><ErrorBanner message={actionError} /></div>}

        {/* Event list states share one card to avoid layout shifts while loading. */}
        <Card>
          <CardHeader>
            <CardTitle>Volunteer events</CardTitle>
            <CardDescription>Open an event to manage its workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div role="status" aria-label="Loading volunteer events" className="grid gap-3">
                {[1, 2, 3].map((row) => <Skeleton key={row} className="h-12 w-full" />)}
              </div>
            ) : events.length === 0 && !loadError ? (
              <div className="py-12 text-center">
                <CalendarDays className="mx-auto mb-3 h-9 w-9 text-muted-foreground" aria-hidden="true" />
                <p className="font-semibold">No volunteer events yet</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Create the first event to get started.</p>
                <Button type="button" onClick={openCreate}><Plus /> Create event</Button>
              </div>
            ) : !loadError ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Event</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {events.map((event) => {
                      const terminal = terminalStatuses.has(event.status);
                      return (
                        <TableRow key={event.id}>
                          <TableCell>
                            <button type="button" className="text-left font-semibold hover:underline" onClick={() => navigate(VOLUNTEERS.event(event.id))}>
                              {event.name}
                            </button>
                            {event.description && <p className="max-w-md truncate text-xs text-muted-foreground mt-1">{event.description}</p>}
                            {event.venueName && <p className="text-xs text-muted-foreground mt-1">{event.venueName}{event.address ? ` — ${event.address}` : ''}</p>}
                          </TableCell>
                          <TableCell>{displayDate(event.eventDate)}</TableCell>
                          <TableCell><Badge variant="outline">{event.statusLabel}</Badge></TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button asChild size="sm" variant="outline"><Link to={VOLUNTEERS.event(event.id)}>Open</Link></Button>
                              {!terminal && <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${event.name}`} onClick={() => openEdit(event)}><Pencil /> Edit</Button>}
                              {!terminal && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Complete ${event.name}`} onClick={() => setPendingAction({ type: 'complete', event })}><CheckCircle2 /></Button>}
                              {!terminal && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Cancel ${event.name}`} onClick={() => setPendingAction({ type: 'cancel', event })}><XCircle /></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>

      {formOpen && (
        <EventFormDialog
          key={editing?.id ?? 'new'}
          open={formOpen}
          event={editing}
          busy={busy}
          error={formError}
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
    </div>
  );
}
