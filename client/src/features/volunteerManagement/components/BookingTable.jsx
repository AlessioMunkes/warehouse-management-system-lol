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

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AttendanceSummary from './AttendanceSummary';

const formatTimeslot = (slot, spaces) => {
  if (!slot) return 'Timeslot unavailable';
  const start = new Date(slot.startTime).toLocaleString('en-ZA');
  const end = new Date(slot.endTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const space = spaces.find((item) => item.id === slot.spaceId);
  const venue = space ? `${space.name}${space.location ? ` — ${space.location}` : ''}` : 'Unknown space';
  return `${start} – ${end} · ${venue}`;
};

export default function BookingTable({ bookings, timeslots = [], spaces = [], attendanceByBooking, summaries, busyBookingId, canAddWalkIn = true, canRecordAttendance = true, onCheckIn, onCheckOut, onAddWalkIn }) {
  const [timeslotFilter, setTimeslotFilter] = useState('');
  const visibleBookings = timeslotFilter ? bookings.filter((booking) => booking.timeslotId === timeslotFilter) : bookings;
  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Bookings and attendance</CardTitle><CardDescription>VMS and local walk-in bookings for this event.</CardDescription></div>{canAddWalkIn && <Button onClick={onAddWalkIn}>Register walk-in</Button>}</CardHeader>
    <CardContent className="grid gap-5">
      <AttendanceSummary summaries={summaries} />
      {timeslots.length > 1 && <div className="flex items-center gap-2"><label htmlFor="booking-timeslot-filter" className="text-sm font-medium">Timeslot</label><select id="booking-timeslot-filter" className="h-9 rounded-md border bg-background px-3 text-sm" value={timeslotFilter} onChange={(e) => setTimeslotFilter(e.target.value)}><option value="">All event bookings</option>{timeslots.map((slot) => <option key={slot.id} value={slot.id}>{new Date(slot.startTime).toLocaleString('en-ZA')}</option>)}</select></div>}
      {visibleBookings.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{bookings.length ? 'No bookings for this timeslot.' : 'No bookings for this event.'}</p> : <div className="overflow-x-auto rounded-md border"><Table>
        <TableHeader><TableRow><TableHead>Volunteer</TableHead><TableHead>Timeslot</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Attendance</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>{visibleBookings.map((booking) => {
          const attendance = attendanceByBooking[booking.id];
          const checkedIn = Boolean(attendance?.checkedIn);
          const disabled = booking.status === 'CANCELLED' || busyBookingId === booking.id;
          const slot = timeslots.find((item) => item.id === booking.timeslotId);
          return <TableRow key={booking.id}><TableCell className="font-medium">{`${booking.firstName} ${booking.lastName}`.trim()}</TableCell><TableCell className="text-xs">{formatTimeslot(slot, spaces)}</TableCell><TableCell><Badge variant="outline">{booking.source}</Badge></TableCell><TableCell><Badge variant="outline">{booking.status}</Badge></TableCell><TableCell>{checkedIn ? <Badge>Checked in</Badge> : <span className="text-sm text-muted-foreground">Not checked in</span>}</TableCell><TableCell className="text-right">{canRecordAttendance && <Button size="sm" variant={checkedIn ? 'outline' : 'default'} disabled={disabled} onClick={() => checkedIn ? onCheckOut(booking.id) : onCheckIn(booking.id)}>{checkedIn ? 'Undo check-in' : 'Check in'}</Button>}</TableCell></TableRow>;
        })}</TableBody>
      </Table></div>}
    </CardContent>
  </Card>;
}
