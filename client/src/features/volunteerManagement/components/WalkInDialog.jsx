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

const validate = ({ timeslotId, firstName }) => {
  const errors = {};
  if (!timeslotId) errors.timeslotId = 'Timeslot is required.';
  if (!firstName.trim()) errors.firstName = 'First name is required.';
  return errors;
};

const errorList = (errors) => Object.values(errors);

export default function WalkInDialog({ open, timeslots, busy, error, onOpenChange, onSubmit }) {
  const [timeslotId, setTimeslotId] = useState(timeslots.find((slot) => slot.status === 'OPEN')?.id ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const submit = (e) => {
    e.preventDefault();
    const nextErrors = validate({ timeslotId, firstName });
    setValidationErrors(nextErrors);
    if (errorList(nextErrors).length > 0) return;
    onSubmit(timeslotId, { volunteerFirstName: firstName.trim(), volunteerLastName: lastName.trim() || null });
  };
  const validationMessages = errorList(validationErrors);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md"><form onSubmit={submit} noValidate>
        <DialogHeader><DialogTitle>Register walk-in</DialogTitle><DialogDescription>Creates a local WMS_GUEST booking. No external IDs are collected.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-5">
          <div className="grid gap-2"><Label htmlFor="walkin-timeslot">Timeslot</Label><select id="walkin-timeslot" className="h-9 rounded-md border bg-background px-3 text-sm" value={timeslotId} onChange={(e) => { setTimeslotId(e.target.value); setValidationErrors((current) => { const next = { ...current }; delete next.timeslotId; return next; }); }} disabled={busy} aria-invalid={Boolean(validationErrors.timeslotId) || undefined} aria-describedby={validationErrors.timeslotId ? 'walkin-timeslot-error' : undefined}><option value="">Select a timeslot</option>{timeslots.filter((slot) => slot.status === 'OPEN').map((slot) => <option key={slot.id} value={slot.id}>{new Date(slot.startTime).toLocaleString('en-ZA')}</option>)}</select>{validationErrors.timeslotId && <p id="walkin-timeslot-error" className="text-xs text-destructive">{validationErrors.timeslotId}</p>}</div>
          <div className="grid gap-2"><Label htmlFor="walkin-first">First name</Label><Input id="walkin-first" value={firstName} onChange={(e) => { setFirstName(e.target.value); setValidationErrors((current) => { const next = { ...current }; delete next.firstName; return next; }); }} disabled={busy} aria-invalid={Boolean(validationErrors.firstName) || undefined} aria-describedby={validationErrors.firstName ? 'walkin-first-error' : undefined} />{validationErrors.firstName && <p id="walkin-first-error" className="text-xs text-destructive">{validationErrors.firstName}</p>}</div>
          <div className="grid gap-2"><Label htmlFor="walkin-last">Last name (optional)</Label><Input id="walkin-last" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={busy} /></div>
          {validationMessages.length > 0 && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><p className="font-medium">Please fix the following:</p><ul className="mt-2 list-disc space-y-1 pl-5">{validationMessages.map((message) => <li key={message}>{message}</li>)}</ul></div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register walk-in'}</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
  );
}
