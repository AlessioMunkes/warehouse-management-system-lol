/**
 * WalkInDialog — Walk-In Registration Dialog
 *
 * This dialog allows coordinators to register walk-in volunteers directly
 * into the system without requiring an external booking. It:
 *   - Lets users select an open timeslot
 *   - Collects volunteer name (first name required, last name optional)
 *   - Creates a local WMS_GUEST booking (no external IDs collected)
 *
 * Walk-ins appear alongside VMS bookings in the BookingTable.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function WalkInDialog({ open, timeslots, busy, error, onOpenChange, onSubmit }) {
  const [timeslotId, setTimeslotId] = useState(timeslots.find((slot) => slot.status === 'OPEN')?.id ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [validationError, setValidationError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!timeslotId || !firstName.trim()) {
      setValidationError('Choose an open timeslot and enter a first name.');
      return;
    }
    onSubmit(timeslotId, { volunteerFirstName: firstName.trim(), volunteerLastName: lastName.trim() || null });
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md"><form onSubmit={submit}>
        <DialogHeader><DialogTitle>Register walk-in</DialogTitle><DialogDescription>Creates a local WMS_GUEST booking. No external IDs are collected.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-5">
          <div className="grid gap-2"><Label htmlFor="walkin-timeslot">Timeslot</Label><select id="walkin-timeslot" className="h-9 rounded-md border bg-background px-3 text-sm" value={timeslotId} onChange={(e) => setTimeslotId(e.target.value)} disabled={busy}><option value="">Select a timeslot</option>{timeslots.filter((slot) => slot.status === 'OPEN').map((slot) => <option key={slot.id} value={slot.id}>{new Date(slot.startTime).toLocaleString('en-ZA')}</option>)}</select></div>
          <div className="grid gap-2"><Label htmlFor="walkin-first">First name</Label><Input id="walkin-first" value={firstName} onChange={(e) => { setFirstName(e.target.value); setValidationError(''); }} disabled={busy} /></div>
          <div className="grid gap-2"><Label htmlFor="walkin-last">Last name</Label><Input id="walkin-last" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={busy} /></div>
          {(validationError || error) && <p role="alert" className="text-sm text-destructive">{validationError || error}</p>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register walk-in'}</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
  );
}
