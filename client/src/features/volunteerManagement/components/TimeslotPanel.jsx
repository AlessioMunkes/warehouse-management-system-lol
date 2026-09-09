/**
 * TimeslotPanel — Timeslot & Capacity Management
 *
 * This component provides the interface for managing timeslots within a volunteer event.
 * It allows coordinators to:
 *   - View all timeslots with their capacity and booking status
 *   - Create new timeslots (requires an active event space)
 *   - Edit existing timeslots
 *   - Close or cancel timeslots
 *   - Add new event spaces on-the-fly
 *
 * Each timeslot displays a progress bar showing booking utilization.
 * Booking changes are automatically published to VMS (no manual publish step).
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const localValue = (value) => value ? new Date(value).toISOString().slice(0, 16) : '';
const readable = (value) => value ? new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value)) : 'Not set';

export default function TimeslotPanel({ timeslots, capacityBySlot, spaces, spacesLoading, spacesError, onRetrySpaces, onCreateSpace, busy, canEdit = true, onCreate, onUpdate, onClose, onCancel }) {
  const [form, setForm] = useState({ spaceId: '', startTime: '', endTime: '', capacity: '' });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [newSpace, setNewSpace] = useState({ spaceName: '', location: '' });
  const [spaceCreateError, setSpaceCreateError] = useState('');
  const editing = timeslots.find((slot) => slot.id === editingId);
  const spaceUnavailable = !editing && (spacesLoading || Boolean(spacesError) || spaces.length === 0);

  const update = (field) => (e) => setForm((current) => ({ ...current, [field]: e.target.value }));
  const reset = () => {
    setForm({ spaceId: '', startTime: '', endTime: '', capacity: '' });
    setEditingId(null);
    setError('');
  };
  const beginEdit = (slot) => {
    setEditingId(slot.id);
    setForm({ spaceId: slot.spaceId, startTime: localValue(slot.startTime), endTime: localValue(slot.endTime), capacity: String(slot.capacity) });
  };
  const addSpace = async () => {
    if (!newSpace.spaceName.trim()) {
      setSpaceCreateError('Space name is required.');
      return;
    }
    setSpaceCreateError('');
    const created = await onCreateSpace({ spaceName: newSpace.spaceName.trim(), location: newSpace.location.trim() || null });
    if (created) {
      setForm((current) => ({ ...current, spaceId: created.id }));
      setNewSpace({ spaceName: '', location: '' });
    } else {
      setSpaceCreateError('Could not add the space. Try a different name.');
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.spaceId) {
      setError(spaces.length === 0
        ? 'An active event space is required before a timeslot can be added.'
        : 'Select a space.');
      return;
    }
    if (!form.startTime || !form.endTime || Number(form.capacity) <= 0) {
      setError('Start, end, and a positive capacity are required.');
      return;
    }
    if (new Date(form.endTime) <= new Date(form.startTime)) {
      setError('End time must be after start time.');
      return;
    }
    const slot = { startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString(), capacity: Number(form.capacity) };
    const saved = editingId
      ? await onUpdate(editingId, slot)
      : await onCreate({ spaceId: form.spaceId, timeslots: [slot] });
    if (saved) reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeslots and capacity</CardTitle>
        <CardDescription>Booking changes publish to VMS automatically. There is no manual publish step.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {canEdit && <form onSubmit={submit} className="grid gap-3 rounded-md border p-4">
          <h3 className="font-semibold">{editing ? 'Edit timeslot' : 'Add timeslot'}</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="event-space">Space</Label>
              {spacesLoading ? <p role="status" className="text-sm text-muted-foreground">Loading spaces…</p> : spacesError ? <div role="alert" className="text-sm text-destructive"><p>{spacesError}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={onRetrySpaces}>Try spaces again</Button></div> : spaces.length === 0 ? <p className="text-sm text-muted-foreground">No active event spaces are available.</p> : <Select value={form.spaceId || null} onValueChange={(value) => setForm((current) => ({ ...current, spaceId: value ?? '' }))} disabled={busy || Boolean(editing)}><SelectTrigger id="event-space" className="w-full"><SelectValue placeholder="Select a space" /></SelectTrigger><SelectContent>{spaces.map((space) => <SelectItem key={space.id} value={space.id}>{space.name}{space.location ? ` — ${space.location}` : ''}</SelectItem>)}</SelectContent></Select>}
              {!editing && <div className="grid gap-2 rounded-md border p-3"><p className="text-xs font-semibold">Add new space</p><Input aria-label="New space name" placeholder="Space name" value={newSpace.spaceName} onChange={(e) => setNewSpace((current) => ({ ...current, spaceName: e.target.value }))} disabled={busy} /><Input aria-label="New space location" placeholder="Location (optional)" value={newSpace.location} onChange={(e) => setNewSpace((current) => ({ ...current, location: e.target.value }))} disabled={busy} /><Button type="button" size="sm" variant="outline" onClick={addSpace} disabled={busy}>Add space</Button>{spaceCreateError && <p role="alert" className="text-xs text-destructive">{spaceCreateError}</p>}</div>}
            </div>
            <div className="grid gap-2"><Label htmlFor="slot-start">Start</Label><Input id="slot-start" type="datetime-local" value={form.startTime} onChange={update('startTime')} disabled={busy} /></div>
            <div className="grid gap-2"><Label htmlFor="slot-end">End</Label><Input id="slot-end" type="datetime-local" value={form.endTime} onChange={update('endTime')} disabled={busy} /></div>
            <div className="grid gap-2"><Label htmlFor="slot-capacity">Capacity</Label><Input id="slot-capacity" type="number" min="1" value={form.capacity} onChange={update('capacity')} disabled={busy} /></div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2"><Button type="submit" disabled={busy || spaceUnavailable}>{editing ? 'Save timeslot' : 'Add timeslot'}</Button>{editing && <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button>}</div>
        </form>}

        {timeslots.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No timeslots configured.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {timeslots.map((slot) => {
              const summary = capacityBySlot[slot.id];
              const used = summary?.capacity ? Math.min(100, (summary.booked / summary.capacity) * 100) : 0;
              const active = slot.status === 'OPEN';
              return (
                <div key={slot.id} className="rounded-md border p-4 grid gap-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{readable(slot.startTime)}</p><p className="text-xs text-muted-foreground">to {readable(slot.endTime)} · {spaces.find((space) => space.id === slot.spaceId)?.name ?? 'Unknown space'}</p></div><Badge variant="outline">{slot.status}</Badge></div>
                  {summary ? <div><div className="mb-2 flex justify-between text-sm"><span>{summary.booked} booked</span><span>{summary.remaining} remaining</span></div><Progress value={used} /><p className="mt-1 text-xs text-muted-foreground">Capacity {summary.capacity}</p></div> : <p className="text-sm text-muted-foreground">Capacity unavailable.</p>}
                  {canEdit && active && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => beginEdit(slot)}>Edit</Button><Button size="sm" variant="outline" onClick={() => onClose(slot.id)}>Close</Button><Button size="sm" variant="destructive" onClick={() => onCancel(slot.id)}>Cancel</Button></div>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
