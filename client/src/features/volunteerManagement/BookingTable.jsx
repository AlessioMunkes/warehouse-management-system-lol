/**
 * BookingTable — Volunteer Booking & Attendance Display
 *
 * This component displays all bookings for a volunteer event in a table format.
 * It provides:
 *   - A summary of attendance across all timeslots
 *   - Filtering by timeslot (when multiple timeslots exist)
 *   - Check-in/check-out functionality for recording attendance
 *   - Visual indicators for booking source (VMS vs WMS_GUEST) and status
 *
 * Warehouse staff can record attendance, while coordinators can also register walk-ins.
 */

import { useMemo, useState } from 'react';
import StatusBadge from '@/components/ui/status-badge';

// CONFIRMED → Confirmed.
const sentence = (s) => String(s ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AttendanceSummary from './AttendanceSummary';
import ListToolbar from '@/components/ui/list-toolbar';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';
import { formatJohannesburgDateTime, formatJohannesburgTime } from './dateTime';

const formatTimeslot = (slot, spaces) => {
  if (!slot) return 'Timeslot unavailable';
  const start = formatJohannesburgDateTime(slot.startTime, { dateStyle: 'short', timeStyle: 'short' });
  const end = formatJohannesburgTime(slot.endTime);
  const space = spaces.find((item) => item.id === slot.spaceId);
  const venue = space ? `${space.name}${space.location ? ` (${space.location})` : ''}` : 'Unknown space';
  return `${start} – ${end} · ${venue}`;
};

// Every column but the volunteer can be hidden; the check-in button
// always shows.
const COLUMNS = [
  { key: 'volunteer', label: 'Volunteer', alwaysOn: true },
  { key: 'timeslot', label: 'Timeslot' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'action', label: '', alwaysOn: true },
];

export default function BookingTable({ bookings, timeslots = [], spaces = [], attendanceByBooking, summaries, busyBookingId, canAddWalkIn = true, canRecordAttendance = true, onCheckIn, onCheckOut, onAddWalkIn }) {
  const [search, setSearch] = useState('');
  const view = useTableView('eventBookings', COLUMNS);
  const show = view.isVisible;
  // The same "+ Filter" as every list: which slot, how they booked, the
  // booking's state and whether they have arrived.
  const filterDefs = useMemo(() => [
    { key: 'timeslot', label: 'Timeslot', valueOf: (b) => b.timeslotId,
      labelOf: (id) => formatTimeslot(timeslots.find((t) => String(t.id) === String(id)), spaces) },
    { key: 'source', label: 'Source', valueOf: (b) => b.source },
    { key: 'status', label: 'Status', valueOf: (b) => b.status, labelOf: sentence },
    { key: 'attendance', label: 'Attendance', valueOf: (b) => (attendanceByBooking[b.id]?.checkedIn ? 'in' : 'out'),
      labelOf: (v) => (v === 'in' ? 'Checked in' : 'Not checked in') },
  ], [timeslots, spaces, attendanceByBooking]);
  const listFilters = useListFilters(filterDefs, bookings);
  const q = search.trim().toLowerCase();
  const visibleBookings = listFilters.apply(bookings)
    .filter((b) => !q || `${b.firstName} ${b.lastName}`.toLowerCase().includes(q));
  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Bookings and attendance</CardTitle><CardDescription>Check volunteers in as they arrive, and register walk-ins.</CardDescription></div>{canAddWalkIn && <Button onClick={onAddWalkIn}>Register walk-in</Button>}</CardHeader>
    <CardContent className="grid gap-5">
      <AttendanceSummary summaries={summaries} />
      <ListToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search by volunteer name' }}
        filters={listFilters.filters}
        onClearAll={() => { setSearch(''); listFilters.clear(); }}
        columns={{
          idPrefix: 'bookings',
          columns: view.availableColumns,
          hidden: view.hidden,
          onToggle: view.toggleColumn,
          onReset: view.resetColumns,
        }}
      />
      {visibleBookings.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{bookings.length ? 'No bookings match.' : 'No bookings for this event.'}</p> : <div className="overflow-x-auto rounded-md border"><Table>
        <TableHeader><TableRow>
          <TableHead>Volunteer</TableHead>
          {show('timeslot') ? <TableHead>Timeslot</TableHead> : null}
          {show('source') ? <TableHead>Source</TableHead> : null}
          {show('status') ? <TableHead>Status</TableHead> : null}
          {show('attendance') ? <TableHead>Attendance</TableHead> : null}
          <TableHead className="text-right">Action</TableHead>
        </TableRow></TableHeader>
        <TableBody>{visibleBookings.map((booking) => {
          const attendance = attendanceByBooking[booking.id];
          const checkedIn = Boolean(attendance?.checkedIn);
          const disabled = booking.status === 'CANCELLED' || busyBookingId === booking.id;
          const slot = timeslots.find((item) => item.id === booking.timeslotId);
          return <TableRow key={booking.id}>
            <TableCell className="font-medium">{`${booking.firstName} ${booking.lastName}`.trim()}</TableCell>
            {show('timeslot') ? <TableCell className="text-xs">{formatTimeslot(slot, spaces)}</TableCell> : null}
            {show('source') ? <TableCell><StatusBadge tone="neutral">{booking.source}</StatusBadge></TableCell> : null}
            {show('status') ? <TableCell><StatusBadge kind="booking" status={booking.status}>{sentence(booking.status)}</StatusBadge></TableCell> : null}
            {show('attendance') ? <TableCell>{checkedIn ? <StatusBadge kind="booking" status="checked_in">Checked in</StatusBadge> : <span className="text-sm text-muted-foreground">Not checked in</span>}</TableCell> : null}
            <TableCell className="text-right">{canRecordAttendance && <Button size="sm" variant={checkedIn ? 'outline' : 'default'} disabled={disabled} onClick={() => checkedIn ? onCheckOut(booking.id) : onCheckIn(booking.id)}>{checkedIn ? 'Undo check-in' : 'Check in'}</Button>}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>}
    </CardContent>
  </Card>;
}
