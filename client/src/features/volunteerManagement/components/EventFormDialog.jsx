/**
 * EventFormDialog — Create/Edit Volunteer Event Dialog
 *
 * This dialog handles both creating new volunteer events and editing existing ones.
 * It collects:
 *   - Event name (required)
 *   - Event date (required)
 *   - Venue name (required)
 *   - Address (required)
 *   - Description (optional)
 *
 * The dialog reuses the same form for both operations, pre-populating fields
 * when editing an existing event. Publication to VMS happens automatically
 * through the booking management workflow.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const emptyForm = { eventName: '', eventDate: '', venueName: '', address: '', description: '' };

export default function EventFormDialog({ open, event, busy, error, onOpenChange, onSubmit }) {
  const [form, setForm] = useState(() => event ? {
    eventName: event.name,
    eventDate: String(event.eventDate ?? '').slice(0, 10),
    venueName: event.venueName ?? '',
    address: event.address ?? '',
    description: event.description,
  } : emptyForm);
  const [validationError, setValidationError] = useState('');
  const editing = Boolean(event);

  const update = (field) => (e) => {
    setForm((current) => ({ ...current, [field]: e.target.value }));
    setValidationError('');
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.eventName.trim()) {
      setValidationError('Event name is required.');
      return;
    }
    if (!form.eventDate) {
      setValidationError('Event date is required.');
      return;
    }
    if (!form.venueName.trim() || !form.address.trim()) {
      setValidationError('Venue name and address are required.');
      return;
    }
    onSubmit({
      eventName: form.eventName.trim(),
      eventDate: form.eventDate,
      venueName: form.venueName.trim(),
      address: form.address.trim(),
      description: form.description.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit event' : 'Create event'}</DialogTitle>
            <DialogDescription>
              Add the event details. Publication to VMS happens automatically through booking management.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5">
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-name">Event name</Label>
              <Input
                id="volunteer-event-name"
                value={form.eventName}
                maxLength={200}
                onChange={update('eventName')}
                disabled={busy}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-date">Event date</Label>
              <Input
                id="volunteer-event-date"
                type="date"
                value={form.eventDate}
                onChange={update('eventDate')}
                disabled={busy}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-venue">Venue name</Label>
              <Input id="volunteer-event-venue" value={form.venueName} onChange={update('venueName')} disabled={busy} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-address">Address</Label>
              <Input id="volunteer-event-address" value={form.address} onChange={update('address')} disabled={busy} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-description">Description</Label>
              <Textarea
                id="volunteer-event-description"
                value={form.description}
                onChange={update('description')}
                disabled={busy}
                rows={4}
              />
            </div>
            {(validationError || error) && (
              <p role="alert" className="text-sm text-destructive">
                {validationError || error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
