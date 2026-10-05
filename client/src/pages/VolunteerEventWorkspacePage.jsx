/**
 * VolunteerEventWorkspacePage — Single Event Workspace
 *
 * This page provides the detailed workspace for managing a single volunteer event.
 * It loads and displays all related data for one event including:
 *   - Event details (name, date, venue, description, status)
 *   - Schedule and capacity information
 *   - Booking management (view bookings, register walk-ins)
 *   - Attendance tracking (check-in/check-out volunteers)
 *   - VMS sync status (monitor and retry synchronization with external system)
 *
 * The workspace is backed by a single event snapshot, ensuring all panels
 * (timeslot, booking, attendance) stay in sync.
 *
 * Access is restricted to users with MANAGERS_UP.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import TimeslotPanel from '../features/volunteerManagement/components/TimeslotPanel';
import BookingTable from '../features/volunteerManagement/components/BookingTable';
import WalkInDialog from '../features/volunteerManagement/components/WalkInDialog';
import SyncStatusCard from '../features/volunteerManagement/components/SyncStatusCard';
import volunteerManagementAPI from '../services/volunteerManagementAPI';
import { VOLUNTEERS } from '../routes/paths';
import { ALL_STAFF, MANAGERS_UP } from '../routes/permissions';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import ErrorBanner from '@/components/ui/error-banner';
import Notice from '@/components/ui/notice';

const formatDate = (value) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : '';

export default function VolunteerEventWorkspacePage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const canManage = MANAGERS_UP.includes(user?.role);
  const canRecordAttendance = ALL_STAFF.includes(user?.role);
  const [workspace, setWorkspace] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [attendanceByBooking, setAttendanceByBooking] = useState({});
  const [capacityBySlot, setCapacityBySlot] = useState({});
  const [summaries, setSummaries] = useState([]);
  const [sync, setSync] = useState(null);
  const [spaces, setSpaces] = useState([]);
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { await applyData(); } catch (err) { if (!cancelled) setError(err.message); } finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    volunteerManagementAPI.getSpaces()
      .then((rows) => { if (!cancelled) setSpaces(rows); })
      .catch(() => { if (!cancelled) setSpaces([]); });
    return () => { cancelled = true; };
  }, []);

  // Timeslot and sync mutations all refresh the workspace from server truth.
  const mutate = async (operation, message) => {
    setBusy(true); setError(''); setSuccess('');
    try { await operation(); await applyData(); setSuccess(message); return true; }
    catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  };

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

  return (
    <PageShell>
      <Link className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 mb-2 text-muted-foreground' })} to={VOLUNTEERS.events}>
        <ChevronLeft /> Back to events
      </Link>
      <ErrorBanner className="mb-4" message={error} onRetry={refresh} />
      <Notice className="mb-4" message={success} onClear={() => setSuccess('')} />
      {/* Keep all workspace panels backed by the same event snapshot. */}
      {isLoading ? (
        <div role="status" aria-label="Loading event workspace" className="grid gap-4">
          <Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" />
        </div>
      ) : event ? (
        <div className="grid gap-6">
          <div>
            <PageHeader
              title={event.name}
              description={[formatDate(event.eventDate), event.venueName, event.address].filter(Boolean).join(' · ')}
              actions={<StatusBadge kind="volunteerEvent" status={event.status}>{event.statusLabel}</StatusBadge>}
            />
            {event.description && <p className="mt-3 max-w-3xl text-sm">{event.description}</p>}
          </div>
          <TimeslotPanel timeslots={workspace.timeslots} capacityBySlot={capacityBySlot} spaces={spaces} />
          <BookingTable bookings={bookings} timeslots={workspace.timeslots} spaces={spaces} attendanceByBooking={attendanceByBooking} summaries={summaries} busyBookingId={busyBookingId} canAddWalkIn={canManage && eventIsActive} canRecordAttendance={canRecordAttendance && event.status !== 'CANCELLED'} onCheckIn={(id) => setAttendance(id, true)} onCheckOut={(id) => setAttendance(id, false)} onAddWalkIn={() => { setWalkInError(''); setWalkInOpen(true); }} />
          {canManage && <SyncStatusCard sync={sync} busy={busy} onRetry={retrySync} />}
        </div>
      ) : !error ? <p className="py-12 text-center text-sm text-muted-foreground">Event not found.</p> : null}
      {walkInOpen && <WalkInDialog open={walkInOpen} timeslots={workspace?.timeslots ?? []} busy={busy} error={walkInError} onOpenChange={setWalkInOpen} onSubmit={createWalkIn} />}
    </PageShell>
  );
}
