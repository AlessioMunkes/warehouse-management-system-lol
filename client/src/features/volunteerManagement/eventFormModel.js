// ─────────────────────────────────────────────────────────────
// src/features/volunteerManagement/eventFormModel.js
//
// The event form's data: an empty form and timeslot, the checks before
// saving, the payloads sent for a new event and for an edit, and the
// wording for availability and address suggestions. No React; the
// dialog itself is EventFormDialog.jsx.
// ─────────────────────────────────────────────────────────────
import {
  dateOnly,
  johannesburgDatePart,
  johannesburgWallTimeToUtcIso,
  johannesburgTimePart,
} from './dateTime';

export const makeTimeslot = () => ({
  key: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
  sameAsEventDate: true,
  timeslotDate: '',
  startTime: '',
  endTime: '',
  capacity: '',
});

export const emptyForm = {
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

export const slotField = (index, field) => `timeslots.${index}.${field}`;
export const editField = (field) => `edit.${field}`;

export const emptyEditSections = {
  eventDetails: false,
  date: false,
  venue: false,
  description: false,
  timeslot: false,
  capacity: false,
};

export const datePart = dateOnly;
export const timePart = johannesburgTimePart;

const toDateTime = (date, time) => johannesburgWallTimeToUtcIso(date, time);

export const describeTimeslot = (slot) => {
  const date = johannesburgDatePart(slot.startTime);
  const start = timePart(slot.startTime);
  const end = timePart(slot.endTime);
  const capacity = Number(slot.capacity ?? 0);
  return `${date} ${start}-${end} · capacity ${capacity}`;
};

export const validate = (form, editing) => {
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

export const errorList = (errors) => Object.values(errors);

const eventPayload = (form) => ({
  eventName: form.eventName.trim(),
  eventDate: form.eventDate,
  venueName: form.venueName.trim(),
  address: form.address.trim(),
  description: form.description.trim(),
});

export const editPayload = (form) => {
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

export const toApiTimeslot = (slot, eventDate) => {
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

export const combinedPayload = (form) => ({
  ...eventPayload(form),
  space: form.spaceMode === 'new'
    ? { mode: 'new', spaceName: form.newSpaceName.trim(), location: form.newSpaceLocation.trim() || null }
    : { mode: 'existing', spaceId: form.spaceId },
  timeslots: form.timeslots.map((slot) => toApiTimeslot(slot, form.eventDate)),
});

export const availabilityText = (availability) => {
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

export const mapSuggestions = (features = []) =>
  features.map((feature) => ({
    id: feature.id ?? suggestionLabel(feature),
    label: suggestionLabel(feature),
  })).filter((suggestion) => suggestion.id && suggestion.label);
