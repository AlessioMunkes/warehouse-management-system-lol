/**
 * EventFormDialog - Create/Edit Volunteer Event Dialog.
 *
 * Create mode captures the complete event setup. Edit mode lets staff choose
 * which existing event or timeslot fields to change.
 */

import { useEffect, useRef, useState } from 'react';
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
import NativeSelect from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  dateOnly,
  johannesburgDatePart,
  johannesburgWallTimeToUtcIso,
  johannesburgTimePart,
} from './dateTime';

const makeTimeslot = () => ({
  key: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
  sameAsEventDate: true,
  timeslotDate: '',
  startTime: '',
  endTime: '',
  capacity: '',
});

const emptyForm = {
  eventName: '',
  eventDate: '',
  venueName: '',
  address: '',
  description: '',
  spaceMode: 'existing',
  spaceId: '',
  newSpaceName: '',
  newSpaceLocation: '',
  timeslots: [makeTimeslot()],
};

const MAPBOX_SEARCH_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
const slotField = (index, field) => `timeslots.${index}.${field}`;
const editField = (field) => `edit.${field}`;

const emptyEditSections = {
  eventDetails: false,
  date: false,
  venue: false,
  description: false,
  timeslot: false,
  capacity: false,
};

const datePart = dateOnly;
const timePart = johannesburgTimePart;

const toDateTime = (date, time) => johannesburgWallTimeToUtcIso(date, time);

const describeTimeslot = (slot) => {
  const date = johannesburgDatePart(slot.startTime);
  const start = timePart(slot.startTime);
  const end = timePart(slot.endTime);
  const capacity = Number(slot.capacity ?? 0);
  return `${date} ${start}-${end} · capacity ${capacity}`;
};

const validate = (form, editing) => {
  const errors = {};
  if (!editing || form.editSections.eventDetails) {
    if (!form.eventName.trim()) errors.eventName = 'Event name is required.';
  }
  if (!editing || form.editSections.description) {
    if (!form.description.trim()) errors.description = 'Description is required.';
  }
  if (!editing || form.editSections.date) {
    if (!form.eventDate) errors.eventDate = 'Event date is required.';
  }
  if (!editing || form.editSections.venue) {
    if (!form.venueName.trim()) errors.venueName = 'Venue is required.';
    if (!form.address.trim()) errors.address = 'Address is required.';
  }

  if (editing) {
    if (!Object.values(form.editSections).some(Boolean)) {
      errors[editField('sections')] = 'Choose at least one part of the event to edit.';
    }
    if ((form.editSections.timeslot || form.editSections.capacity) && !form.selectedTimeslotId) {
      errors.selectedTimeslotId = 'Choose a timeslot to edit.';
    }
    const selectedIndex = form.timeslots.findIndex((slot) => slot.id === form.selectedTimeslotId);
    const selected = selectedIndex >= 0 ? form.timeslots[selectedIndex] : null;
    if (form.editSections.timeslot && selected) {
      if (!selected.startTime) errors[slotField(selectedIndex, 'startTime')] = 'Timeslot: start time is required.';
      if (!selected.endTime) errors[slotField(selectedIndex, 'endTime')] = 'Timeslot: end time is required.';
      if (selected.startTime && selected.endTime && selected.endTime <= selected.startTime) {
        errors[slotField(selectedIndex, 'endTime')] = 'Timeslot: end time must be after start time.';
      }
    }
    if (form.editSections.capacity && selected) {
      if (!selected.capacity) errors[slotField(selectedIndex, 'capacity')] = 'Timeslot: capacity is required.';
      else if (!Number.isInteger(Number(selected.capacity)) || Number(selected.capacity) <= 0) {
        errors[slotField(selectedIndex, 'capacity')] = 'Timeslot: capacity must be greater than 0.';
      }
    }
  }

  if (!editing) {
    if (form.spaceMode === 'new') {
      if (!form.newSpaceName.trim()) errors.newSpaceName = 'New space name is required.';
    } else if (!form.spaceId) {
      errors.spaceId = 'Space is required.';
    }

    form.timeslots.forEach((slot, index) => {
      const label = `Timeslot ${index + 1}`;
      const sameDay = slot.sameAsEventDate ?? true;
      if (!sameDay && !slot.timeslotDate) {
        errors[slotField(index, 'timeslotDate')] = `${label}: timeslot date is required.`;
      }
      if (!slot.startTime) errors[slotField(index, 'startTime')] = `${label}: start time is required.`;
      if (!slot.endTime) errors[slotField(index, 'endTime')] = `${label}: end time is required.`;
      if (!slot.capacity) errors[slotField(index, 'capacity')] = `${label}: capacity is required.`;
      else if (Number(slot.capacity) <= 0) errors[slotField(index, 'capacity')] = `${label}: capacity must be greater than 0.`;

      if (slot.startTime && slot.endTime) {
        const s = slot.startTime.includes('T') ? slot.startTime.split('T')[1].slice(0, 5) : slot.startTime;
        const e = slot.endTime.includes('T') ? slot.endTime.split('T')[1].slice(0, 5) : slot.endTime;
        if (e <= s) {
          errors[slotField(index, 'endTime')] = `${label}: end time must be after start time.`;
        }
      }
    });
  }
  return errors;
};

const errorList = (errors) => Object.values(errors);

const eventPayload = (form) => ({
  eventName: form.eventName.trim(),
  eventDate: form.eventDate,
  venueName: form.venueName.trim(),
  address: form.address.trim(),
  description: form.description.trim(),
});

const editPayload = (form) => {
  const event = {};
  if (form.editSections.eventDetails) event.eventName = form.eventName.trim();
  if (form.editSections.date) event.eventDate = form.eventDate;
  if (form.editSections.venue) {
    event.venueName = form.venueName.trim();
    event.address = form.address.trim();
  }
  if (form.editSections.description) event.description = form.description.trim();

  const selected = form.timeslots.find((slot) => slot.id === form.selectedTimeslotId);
  const timeslotChanges = {};
  if (selected && form.editSections.timeslot) {
    const date = datePart(selected.startDate || selected.startTime);
    timeslotChanges.startTime = toDateTime(date, selected.startTime);
    timeslotChanges.endTime = toDateTime(date, selected.endTime);
  }
  if (selected && form.editSections.capacity) {
    timeslotChanges.capacity = Number(selected.capacity);
  }

  return {
    event,
    timeslot: selected && Object.keys(timeslotChanges).length > 0
      ? { timeslotId: selected.id, changes: timeslotChanges }
      : null,
  };
};

const toApiTimeslot = (slot, eventDate) => {
  const sameDay = slot.sameAsEventDate ?? true;
  const startRaw = slot.startTime || '';
  const endRaw = slot.endTime || '';
  const startStr = startRaw.includes('T') ? startRaw.split('T')[1].slice(0, 5) : startRaw;
  const endStr = endRaw.includes('T') ? endRaw.split('T')[1].slice(0, 5) : endRaw;
  const dateFromStart = startRaw.includes('T') ? johannesburgDatePart(startRaw) : '';
  const date = sameDay ? (eventDate || dateFromStart) : (slot.timeslotDate || dateFromStart);

  return {
    startTime: johannesburgWallTimeToUtcIso(date, startStr),
    endTime: johannesburgWallTimeToUtcIso(date, endStr),
    capacity: Number(slot.capacity),
  };
};

const combinedPayload = (form) => ({
  ...eventPayload(form),
  space: form.spaceMode === 'new'
    ? { mode: 'new', spaceName: form.newSpaceName.trim(), location: form.newSpaceLocation.trim() || null }
    : { mode: 'existing', spaceId: form.spaceId },
  timeslots: form.timeslots.map((slot) => toApiTimeslot(slot, form.eventDate)),
});

const availabilityText = (availability) => {
  if (!availability) return '';
  if (availability.available) return 'Times available';
  return availability.conflicts?.map((conflict) => {
    const prefix = Number.isInteger(conflict.index) ? `Timeslot ${conflict.index + 1}: ` : '';
    return `${prefix}${conflict.message ?? 'The selected time is not available.'}`;
  }).join(' ');
};

const suggestionLabel = (feature) =>
  feature?.properties?.full_address
  ?? feature?.properties?.place_formatted
  ?? feature?.properties?.name
  ?? feature?.place_name
  ?? '';

const mapSuggestions = (features = []) =>
  features.map((feature) => ({
    id: feature.id ?? suggestionLabel(feature),
    label: suggestionLabel(feature),
  })).filter((suggestion) => suggestion.id && suggestion.label);

export default function EventFormDialog({
  open,
  event,
  busy,
  error,
  spaces = [],
  spacesLoading = false,
  spacesError = '',
  onRetrySpaces,
  onValidateTime,
  onOpenChange,
  onSubmit,
}) {
  const editing = Boolean(event);
  const eventTimeslots = event?.timeslots ?? [];
  const [form, setForm] = useState(() => event ? {
    ...emptyForm,
    eventName: event.name,
    eventDate: datePart(event.eventDate),
    venueName: event.venueName ?? '',
    address: event.address ?? '',
    description: event.description,
    editSections: { ...emptyEditSections },
    selectedTimeslotId: eventTimeslots[0]?.id ?? '',
    timeslots: eventTimeslots.map((slot) => ({
      id: slot.id,
      key: slot.id,
      startDate: johannesburgDatePart(slot.startTime),
      startTime: timePart(slot.startTime),
      endTime: timePart(slot.endTime),
      capacity: String(slot.capacity ?? ''),
      original: slot,
    })),
  } : emptyForm);
  const [validationErrors, setValidationErrors] = useState({});
  const [availability, setAvailability] = useState(null);
  const [validateError, setValidateError] = useState('');
  const [validating, setValidating] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressSearchError, setAddressSearchError] = useState('');
  const selectedAddressRef = useRef('');

  const clearValidatedState = () => {
    setAvailability(null);
    setValidateError('');
  };

  const clearError = (field) => {
    setValidationErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const update = (field) => (e) => {
    const value = e.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'address') {
      selectedAddressRef.current = '';
      setAddressSuggestions([]);
      setAddressSearchError('');
    }
    if (['eventDate', 'spaceMode', 'spaceId', 'newSpaceName', 'newSpaceLocation'].includes(field)) clearValidatedState();
    clearError(field);
  };

  const updateSlot = (index, field) => (e) => {
    const value = e.target.value;
    setForm((current) => ({
      ...current,
      timeslots: current.timeslots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, [field]: value } : slot
      ),
    }));
    clearValidatedState();
    clearError(slotField(index, field));
  };

  const updateEditSection = (field) => (e) => {
    const checked = e.target.checked;
    setForm((current) => ({
      ...current,
      editSections: { ...current.editSections, [field]: checked },
    }));
    clearError(editField('sections'));
  };

  const selectTimeslot = (timeslotId) => {
    setForm((current) => ({ ...current, selectedTimeslotId: timeslotId }));
    clearError('selectedTimeslotId');
  };

  const addTimeslot = () => {
    setForm((current) => ({ ...current, timeslots: [...current.timeslots, makeTimeslot()] }));
    clearValidatedState();
  };

  const removeTimeslot = (index) => {
    setForm((current) => ({
      ...current,
      timeslots: current.timeslots.filter((_, slotIndex) => slotIndex !== index),
    }));
    setValidationErrors({});
    clearValidatedState();
  };

  useEffect(() => {
    const query = form.address.trim();
    const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if (!token || query.length < 3 || query === selectedAddressRef.current) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          country: 'ZA',
          limit: '5',
          access_token: token,
        });
        const response = await fetch(`${MAPBOX_SEARCH_URL}?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Address search failed.');
        const body = await response.json();
        setAddressSuggestions(mapSuggestions(body.features));
        setAddressSearchError('');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setAddressSuggestions([]);
        setAddressSearchError('Address suggestions are unavailable. You can still enter the address manually.');
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.address]);

  const selectAddress = (suggestion) => {
    selectedAddressRef.current = suggestion.label;
    setForm((current) => ({ ...current, address: suggestion.label }));
    setAddressSuggestions([]);
    setAddressSearchError('');
    clearError('address');
  };

  const validateTime = async () => {
    const nextErrors = validate(form, editing);
    const setupErrors = Object.fromEntries(
      Object.entries(nextErrors).filter(([field]) =>
        ['eventDate', 'spaceId', 'newSpaceName'].includes(field) || field.startsWith('timeslots.')
      )
    );
    setValidationErrors((current) => ({ ...current, ...setupErrors }));
    clearValidatedState();
    if (errorList(setupErrors).length > 0) return;

    setValidating(true);
    try {
      const result = await onValidateTime({
        eventDate: form.eventDate,
        spaceId: form.spaceMode === 'existing' ? form.spaceId : null,
        timeslots: form.timeslots.map((slot) => toApiTimeslot(slot, form.eventDate)),
      });
      setAvailability(result);
    } catch (err) {
      setValidateError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const updateSlotCheckbox = (index, field, checked) => {
    setForm((current) => ({
      ...current,
      timeslots: current.timeslots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, [field]: checked } : slot
      ),
    }));
    clearValidatedState();
    clearError(slotField(index, field));
  };

  const submit = (e) => {
    e.preventDefault();
    const nextErrors = validate(form, editing);
    setValidationErrors(nextErrors);
    if (errorList(nextErrors).length > 0) return;
    onSubmit(editing ? editPayload(form) : combinedPayload(form));
  };

  const errors = errorList(validationErrors);

  return (
    <Dialog open={open} disablePointerDismissal onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? 'Edit event' : 'Create event'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Choose the parts of this event to update.' : 'Add event details, space and volunteer timeslots.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-4 overflow-y-auto py-5 pr-1">
            {editing && (
              <div className="grid gap-3 rounded-md border p-4">
                <div>
                  <h3 className="font-semibold">What would you like to edit?</h3>
                  <p className="text-sm text-muted-foreground">Only checked sections will be saved.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['eventDetails', 'Event details'],
                    ['date', 'Date'],
                    ['venue', 'Venue / address'],
                    ['description', 'Description'],
                    ['timeslot', 'Timeslot'],
                    ['capacity', 'Capacity'],
                  ].map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium">
                      <input type="checkbox" checked={form.editSections[field]} onChange={updateEditSection(field)} disabled={busy} />
                      {label}
                    </label>
                  ))}
                </div>
                {validationErrors[editField('sections')] && (
                  <p className="text-xs text-destructive">{validationErrors[editField('sections')]}</p>
                )}
              </div>
            )}

            {(!editing || form.editSections.eventDetails) && (
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-name">Event name</Label>
              <Input id="volunteer-event-name" value={form.eventName} maxLength={200} onChange={update('eventName')} disabled={busy} aria-invalid={Boolean(validationErrors.eventName) || undefined} aria-describedby={validationErrors.eventName ? 'volunteer-event-name-error' : undefined} />
              {validationErrors.eventName && <p id="volunteer-event-name-error" className="text-xs text-destructive">{validationErrors.eventName}</p>}
            </div>
            )}
            {(!editing || form.editSections.date) && (
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-date">Event date</Label>
              <Input id="volunteer-event-date" type="date" value={form.eventDate} onChange={update('eventDate')} disabled={busy} aria-invalid={Boolean(validationErrors.eventDate) || undefined} aria-describedby={validationErrors.eventDate ? 'volunteer-event-date-error' : undefined} />
              {validationErrors.eventDate && <p id="volunteer-event-date-error" className="text-xs text-destructive">{validationErrors.eventDate}</p>}
            </div>
            )}
            {(!editing || form.editSections.venue) && (
            <>
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-venue">Venue name</Label>
              <Input id="volunteer-event-venue" value={form.venueName} onChange={update('venueName')} disabled={busy} aria-invalid={Boolean(validationErrors.venueName) || undefined} aria-describedby={validationErrors.venueName ? 'volunteer-event-venue-error' : undefined} />
              {validationErrors.venueName && <p id="volunteer-event-venue-error" className="text-xs text-destructive">{validationErrors.venueName}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-address">Address</Label>
              <Input id="volunteer-event-address" value={form.address} onChange={update('address')} disabled={busy} aria-invalid={Boolean(validationErrors.address) || undefined} aria-describedby={validationErrors.address ? 'volunteer-event-address-error' : undefined} />
              {validationErrors.address && <p id="volunteer-event-address-error" className="text-xs text-destructive">{validationErrors.address}</p>}
              {addressSuggestions.length > 0 && (
                <div className="rounded-md border bg-background shadow-sm" role="listbox" aria-label="Address suggestions">
                  {addressSuggestions.map((suggestion) => (
                    <button key={suggestion.id} type="button" role="option" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => selectAddress(suggestion)}>
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              )}
              {addressSearchError && <p className="text-xs text-muted-foreground">{addressSearchError}</p>}
            </div>
            </>
            )}
            {(!editing || form.editSections.description) && (
            <div className="grid gap-2">
              <Label htmlFor="volunteer-event-description">Description</Label>
              <Textarea id="volunteer-event-description" value={form.description} onChange={update('description')} disabled={busy} rows={4} aria-invalid={Boolean(validationErrors.description) || undefined} aria-describedby={validationErrors.description ? 'volunteer-event-description-error' : undefined} />
              {validationErrors.description && <p id="volunteer-event-description-error" className="text-xs text-destructive">{validationErrors.description}</p>}
            </div>
            )}

            {editing && (form.editSections.timeslot || form.editSections.capacity) && (
              <div className="grid gap-4 rounded-md border p-4">
                <div>
                  <h3 className="font-semibold">Timeslot to update</h3>
                  <p className="text-sm text-muted-foreground">Choose one existing timeslot. Saving updates that row only.</p>
                </div>
                {form.timeslots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No timeslots are configured for this event.</p>
                ) : (
                  <div className="grid gap-2">
                    {form.timeslots.map((slot, index) => (
                      <label key={slot.id} className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
                        <input
                          type="radio"
                          name="edit-timeslot"
                          value={slot.id}
                          checked={form.selectedTimeslotId === slot.id}
                          onChange={() => selectTimeslot(slot.id)}
                          disabled={busy}
                        />
                        <span>
                          <span className="block font-medium">Timeslot {index + 1}</span>
                          <span className="text-muted-foreground">{describeTimeslot(slot.original ?? slot)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {validationErrors.selectedTimeslotId && <p className="text-xs text-destructive">{validationErrors.selectedTimeslotId}</p>}

                {form.timeslots.map((slot, index) => {
                  if (slot.id !== form.selectedTimeslotId) return null;
                  return (
                    <div key={`${slot.id}-fields`} className="grid gap-3 rounded-md bg-muted/20 p-3">
                      {form.editSections.timeslot && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor={`volunteer-edit-start-${index}`}>Start time</Label>
                            <Input
                              id={`volunteer-edit-start-${index}`}
                              type="time"
                              value={slot.startTime}
                              onChange={updateSlot(index, 'startTime')}
                              disabled={busy}
                              aria-invalid={Boolean(validationErrors[slotField(index, 'startTime')]) || undefined}
                            />
                            {validationErrors[slotField(index, 'startTime')] && (
                              <p className="text-xs text-destructive">{validationErrors[slotField(index, 'startTime')]}</p>
                            )}
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`volunteer-edit-end-${index}`}>End time</Label>
                            <Input
                              id={`volunteer-edit-end-${index}`}
                              type="time"
                              value={slot.endTime}
                              onChange={updateSlot(index, 'endTime')}
                              disabled={busy}
                              aria-invalid={Boolean(validationErrors[slotField(index, 'endTime')]) || undefined}
                            />
                            {validationErrors[slotField(index, 'endTime')] && (
                              <p className="text-xs text-destructive">{validationErrors[slotField(index, 'endTime')]}</p>
                            )}
                          </div>
                        </div>
                      )}
                      {form.editSections.capacity && (
                        <div className="grid gap-2 sm:max-w-xs">
                          <Label htmlFor={`volunteer-edit-capacity-${index}`}>Capacity</Label>
                          <Input
                            id={`volunteer-edit-capacity-${index}`}
                            type="number"
                            min="1"
                            value={slot.capacity}
                            onChange={updateSlot(index, 'capacity')}
                            disabled={busy}
                            aria-invalid={Boolean(validationErrors[slotField(index, 'capacity')]) || undefined}
                          />
                          {validationErrors[slotField(index, 'capacity')] && (
                            <p className="text-xs text-destructive">{validationErrors[slotField(index, 'capacity')]}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!editing && (
              <div className="grid gap-4 rounded-md border p-4">
                <h3 className="font-semibold">Event setup</h3>
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Space</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="space-mode" value="existing" checked={form.spaceMode === 'existing'} onChange={update('spaceMode')} disabled={busy} />
                      Select existing
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="space-mode" value="new" checked={form.spaceMode === 'new'} onChange={update('spaceMode')} disabled={busy} />
                      Create new
                    </label>
                  </div>
                </fieldset>

                {form.spaceMode === 'existing' ? (
                  <div className="grid gap-2">
                    <Label htmlFor="volunteer-event-space">Space</Label>
                    {spacesLoading ? (
                      <p role="status" className="text-sm text-muted-foreground">Loading spaces...</p>
                    ) : spacesError ? (
                      <div role="alert" className="text-sm text-destructive">
                        <p>{spacesError}</p>
                        {onRetrySpaces && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onRetrySpaces}>Try spaces again</Button>}
                      </div>
                    ) : (
                      <NativeSelect id="volunteer-event-space" value={form.spaceId} onChange={update('spaceId')} disabled={busy} aria-invalid={Boolean(validationErrors.spaceId) || undefined} aria-describedby={validationErrors.spaceId ? 'volunteer-event-space-error' : undefined}>
                        <option value="">Select a space</option>
                        {spaces.map((space) => (
                          <option key={space.id} value={space.id}>{space.name}{space.location ? ` - ${space.location}` : ''}</option>
                        ))}
                      </NativeSelect>
                    )}
                    {validationErrors.spaceId && <p id="volunteer-event-space-error" className="text-xs text-destructive">{validationErrors.spaceId}</p>}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="volunteer-new-space-name">New space name</Label>
                      <Input id="volunteer-new-space-name" value={form.newSpaceName} onChange={update('newSpaceName')} disabled={busy} aria-invalid={Boolean(validationErrors.newSpaceName) || undefined} aria-describedby={validationErrors.newSpaceName ? 'volunteer-new-space-name-error' : undefined} />
                      {validationErrors.newSpaceName && <p id="volunteer-new-space-name-error" className="text-xs text-destructive">{validationErrors.newSpaceName}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="volunteer-new-space-location">New space location</Label>
                      <Input id="volunteer-new-space-location" value={form.newSpaceLocation} onChange={update('newSpaceLocation')} disabled={busy} />
                    </div>
                  </div>
                )}

                <div className="grid gap-3">
                  {form.timeslots.map((slot, index) => {
                    const sameDay = slot.sameAsEventDate ?? true;
                    return (
                      <div key={slot.key} className="grid gap-3 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold">Timeslot {index + 1}</h4>
                          {form.timeslots.length > 1 && (
                            <Button type="button" size="sm" variant="outline" onClick={() => removeTimeslot(index)} disabled={busy}>Remove timeslot</Button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <label className="flex items-center gap-2 font-medium">
                            <input
                              type="checkbox"
                              checked={sameDay}
                              onChange={(e) => updateSlotCheckbox(index, 'sameAsEventDate', e.target.checked)}
                              disabled={busy}
                            />
                            Same day as event
                          </label>
                          {sameDay && (
                            <span className="text-xs text-muted-foreground">
                              (Event date: {form.eventDate || 'Not set'})
                            </span>
                          )}
                        </div>

                        {!sameDay && (
                          <div className="grid gap-2">
                            <Label htmlFor={`volunteer-event-date-${index}`}>Timeslot date</Label>
                            <Input
                              id={`volunteer-event-date-${index}`}
                              type="date"
                              value={slot.timeslotDate || ''}
                              onChange={updateSlot(index, 'timeslotDate')}
                              disabled={busy}
                              aria-invalid={Boolean(validationErrors[slotField(index, 'timeslotDate')]) || undefined}
                            />
                            {validationErrors[slotField(index, 'timeslotDate')] && (
                              <p className="text-xs text-destructive">{validationErrors[slotField(index, 'timeslotDate')]}</p>
                            )}
                          </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="grid gap-2">
                            <Label htmlFor={`volunteer-event-start-${index}`}>Start time</Label>
                            <Input
                              id={`volunteer-event-start-${index}`}
                              type="time"
                              value={slot.startTime}
                              onChange={updateSlot(index, 'startTime')}
                              disabled={busy}
                              aria-invalid={Boolean(validationErrors[slotField(index, 'startTime')]) || undefined}
                            />
                            {validationErrors[slotField(index, 'startTime')] && (
                              <p className="text-xs text-destructive">{validationErrors[slotField(index, 'startTime')]}</p>
                            )}
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`volunteer-event-end-${index}`}>End time</Label>
                            <Input
                              id={`volunteer-event-end-${index}`}
                              type="time"
                              value={slot.endTime}
                              onChange={updateSlot(index, 'endTime')}
                              disabled={busy}
                              aria-invalid={Boolean(validationErrors[slotField(index, 'endTime')]) || undefined}
                            />
                            {validationErrors[slotField(index, 'endTime')] && (
                              <p className="text-xs text-destructive">{validationErrors[slotField(index, 'endTime')]}</p>
                            )}
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`volunteer-event-capacity-${index}`}>Capacity</Label>
                            <Input
                              id={`volunteer-event-capacity-${index}`}
                              type="number"
                              min="1"
                              value={slot.capacity}
                              onChange={updateSlot(index, 'capacity')}
                              disabled={busy}
                              aria-invalid={Boolean(validationErrors[slotField(index, 'capacity')]) || undefined}
                            />
                            {validationErrors[slotField(index, 'capacity')] && (
                              <p className="text-xs text-destructive">{validationErrors[slotField(index, 'capacity')]}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={addTimeslot} disabled={busy}>Add Timeslot</Button>
                    <Button type="button" variant="outline" disabled={busy || validating || (form.spaceMode === 'existing' && spacesLoading)} onClick={validateTime}>
                      {validating ? 'Validating...' : 'Validate Times'}
                    </Button>
                  </div>
                  {availability && <p role="status" className={availability.available ? 'text-sm font-medium text-good' : 'text-sm font-medium text-destructive'}>{availability.available ? 'OK ' : 'Warning '}{availabilityText(availability)}</p>}
                  {validateError && <p role="alert" className="text-sm text-destructive">{validateError}</p>}
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-medium">Please fix the following:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} loading={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
