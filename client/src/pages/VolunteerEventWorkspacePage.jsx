/**
 * VolunteerEventWorkspacePage — Single Event Workspace
 *
 * This page provides the detailed workspace for managing a single volunteer event.
 * It loads and displays all related data for one event including:
 *   - Event details (name, date, venue, description, status)
 *   - Timeslot management (create, edit, close, cancel timeslots)
 *   - Booking management (view bookings, register walk-ins)
 *   - Attendance tracking (check-in/check-out volunteers)
 *   - VMS sync status (monitor and retry synchronization with external system)
 *
 * The workspace is backed by a single event snapshot, ensuring all panels
 * (timeslot, booking, attendance) stay in sync.
 *
 * Access is restricted to users with VOLUNTEER_MANAGEMENT_ROLES.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import TimeslotPanel from '../features/volunteerManagement/components/TimeslotPanel';
import BookingTable from '../features/volunteerManagement/components/BookingTable';
import WalkInDialog from '../features/volunteerManagement/components/WalkInDialog';
import SyncStatusCard from '../features/volunteerManagement/components/SyncStatusCard';
import volunteerManagementAPI from '../services/volunteerManagementAPI';
import { VOLUNTEERS, VOLUNTEER_MANAGEMENT_ROLES } from '../routes/paths';
import { useAuth } from '../context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const formatDate = (value) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : '';

export default function VolunteerEventWorkspacePage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const canManage = VOLUNTEER_MANAGEMENT_ROLES.includes(user?.role);
  const canRecordAttendance = ['warehouse_worker', ...VOLUNTEER_MANAGEMENT_ROLES].includes(user?.role);
  const [workspace, setWorkspace] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [attendanceByBooking, setAttendanceByBooking] = useState({});
  const [capacityBySlot, setCapacityBySlot] = useState({});
  const [summaries, setSummaries] = useState([]);
  const [sync, setSync] = useState(null);
  const [spaces, setSpaces] = useState([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [spacesError, setSpacesError] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInError, setWalkInError] = useState('');

  // Load the workspace's related data together, then derive lookup maps used by
  // the timeslot, booking, and attendance components.
  const applyData = useCallback(async () => {
    const [bookingConfig, eventBookings, eventAttendance, syncStatus] = await Promise.all([
      volunteerManagementAPI.getEventBooking(eventId),
      volunteerManagementAPI.getEventBookings(eventId),
      volunteerManagementAPI.getEventAttendance(eventId),
      volunteerManagementAPI.getSyncStatus(eventId),
    ]);
    const [capacities, attendanceSummaries] = await Promise.all([
      Promise.all(bookingConfig.timeslots.map((slot) => volunteerManagementAPI.getCapacity(slot.id))),
      Promise.all(bookingConfig.timeslots.map((slot) => volunteerManagementAPI.getAttendanceSummary(slot.id))),
    ]);
    setWorkspace(bookingConfig);
    setBookings(eventBookings);
    setAttendanceByBooking(Object.fromEntries(eventAttendance.map((row) => [row.bookingId, row])));
    setCapacityBySlot(Object.fromEntries(capacities.map((row) => [row.timeslotId, row])));
    setSummaries(attendanceSummaries);
    setSync(syncStatus);
  }, [eventId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { await applyData(); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [applyData]);

  // Spaces have their own retry state because a failed picker should not hide
  // bookings or attendance that were loaded successfully.
  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true); setSpacesError('');
    try { setSpaces(await volunteerManagementAPI.getSpaces()); }
    catch (err) { setSpacesError(err.message); }
    finally { setSpacesLoading(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { await applyData(); } catch (err) { if (!cancelled) setError(err.message); } finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [applyData]);

  useEffect(() => {
    if (!canManage) {
      return undefined;
    }
    let cancelled = false;
    volunteerManagementAPI.getSpaces()
      .then((rows) => { if (!cancelled) setSpaces(rows); })
      .catch((err) => { if (!cancelled) setSpacesError(err.message); })
      .finally(() => { if (!cancelled) setSpacesLoading(false); });
    return () => { cancelled = true; };
  }, [canManage]);

  // Timeslot and sync mutations all refresh the workspace from server truth.
  const mutate = async (operation, message) => {
    setBusy(true); setError(''); setSuccess('');
    try { await operation(); await applyData(); setSuccess(message); return true; }
    catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  };

  const createTimeslot = (payload) => mutate(() => volunteerManagementAPI.createEventBooking(eventId, payload), 'Timeslot added and VMS publication started.');
  const createSpace = async (payload) => {
    setBusy(true); setError('');
    try {
      const created = await volunteerManagementAPI.createSpace(payload);
      await loadSpaces();
      setSuccess('Space added.');
      return created;
    } catch (err) {
      setError(err.message);
      return null;
    } finally { setBusy(false); }
  };
  const updateTimeslot = (timeslotId, payload) => mutate(() => volunteerManagementAPI.updateTimeslot(eventId, timeslotId, payload), 'Timeslot updated.');
  const closeTimeslot = (timeslotId) => mutate(() => volunteerManagementAPI.closeTimeslot(timeslotId), 'Timeslot closed.');
  const cancelTimeslot = (timeslotId) => mutate(() => volunteerManagementAPI.cancelTimeslot(timeslotId), 'Timeslot cancelled.');

  const createWalkIn = async (timeslotId, payload) => {
    setBusy(true); setWalkInError(''); setSuccess('');
    try { await volunteerManagementAPI.createWalkIn(timeslotId, payload); await applyData(); setWalkInOpen(false); setSuccess('Walk-in registered. Bookings and capacity refreshed.'); }
    catch (err) { setWalkInError(err.message); } finally { setBusy(false); }
  };

  // Attendance is reusable for check-in and undo; only the affected row is
  // disabled while the complete summary is refreshed.
  const setAttendance = async (bookingId, checkedIn) => {
    setBusyBookingId(bookingId); setError(''); setSuccess('');
    try { await volunteerManagementAPI.confirmAttendance(bookingId, checkedIn); await applyData(); setSuccess(checkedIn ? 'Volunteer checked in.' : 'Check-in removed.'); }
    catch (err) { setError(err.message); } finally { setBusyBookingId(null); }
  };

  const retrySync = () => mutate(() => volunteerManagementAPI.retrySync(eventId), 'VMS sync retry completed.');
  const event = workspace?.event;
  const eventIsActive = event && !['COMPLETED', 'CANCELLED'].includes(event.status);

  return <div className="min-h-screen bg-white text-[#2b3336] font-['Montserrat',sans-serif]">
    <main className="px-4 sm:px-6 py-6 max-w-6xl mx-auto grid gap-6">
      <div><Link className={buttonVariants({ variant: 'outline' })} to={VOLUNTEERS.events}>Back to events</Link></div>
      {error && <div role="alert" className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-sm flex justify-between gap-3"><span>{error}</span><Button variant="outline" onClick={refresh}>Try again</Button></div>}
      {success && <div role="status" className="rounded-md border bg-muted p-3 text-sm">{success}</div>}
      {/* Keep all workspace panels backed by the same event snapshot. */}
      {isLoading ? <div role="status" aria-label="Loading event workspace" className="grid gap-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div> : event ? <>
        <Card><CardContent className="p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h1 className="text-2xl font-black">{event.name}</h1><p className="text-sm text-muted-foreground mt-1">{formatDate(event.eventDate)}</p>{event.venueName && <p className="mt-2 text-sm font-semibold">{event.venueName}</p>}{event.address && <p className="text-sm text-muted-foreground">{event.address}</p>}{event.description && <p className="mt-3 text-sm">{event.description}</p>}</div><Badge variant="outline">{event.statusLabel}</Badge></CardContent></Card>
        {canManage && <TimeslotPanel timeslots={workspace.timeslots} capacityBySlot={capacityBySlot} spaces={spaces} spacesLoading={spacesLoading} spacesError={spacesError} onRetrySpaces={loadSpaces} onCreateSpace={createSpace} busy={busy} canEdit={eventIsActive} onCreate={createTimeslot} onUpdate={updateTimeslot} onClose={closeTimeslot} onCancel={cancelTimeslot} />}
        <BookingTable bookings={bookings} timeslots={workspace.timeslots} spaces={spaces} attendanceByBooking={attendanceByBooking} summaries={summaries} busyBookingId={busyBookingId} canAddWalkIn={canManage && eventIsActive} canRecordAttendance={canRecordAttendance && event.status !== 'CANCELLED'} onCheckIn={(id) => setAttendance(id, true)} onCheckOut={(id) => setAttendance(id, false)} onAddWalkIn={() => { setWalkInError(''); setWalkInOpen(true); }} />
        {canManage && <SyncStatusCard sync={sync} busy={busy} onRetry={retrySync} />}
      </> : !error ? <p className="py-12 text-center text-sm text-muted-foreground">Event not found.</p> : null}
    </main>
    {walkInOpen && <WalkInDialog open={walkInOpen} timeslots={workspace?.timeslots ?? []} busy={busy} error={walkInError} onOpenChange={setWalkInOpen} onSubmit={createWalkIn} />}
  </div>;
}
