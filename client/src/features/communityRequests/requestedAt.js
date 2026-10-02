// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/requestedAt.js
//
// "Date & time of request" helpers shared by both request forms.
//
// A datetime-local input yields a bare local string ("2026-10-02T14:30")
// with no offset. Sent as-is the server parses it as UTC, so a SAST
// time was stored two hours late. The payload therefore carries a real
// ISO instant, and an empty field is omitted so the DB default now()
// applies.
// ─────────────────────────────────────────────────────────────

export const FUTURE_REQUEST_MESSAGE = "Date & time of request can't be in the future.";

const pad = (n) => String(n).padStart(2, '0');

// Local "now" in the format a datetime-local input's `max` expects.
export const localDateTimeValue = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const isFutureRequestedAt = (value, now = new Date()) => {
  if (!value) return false;
  const when = new Date(value);
  return !Number.isNaN(when.getTime()) && when.getTime() > now.getTime();
};

// Returns the form values ready for the API: requestedAt is an ISO
// instant, or absent when the field was left empty.
export const withRequestedAtForServer = (form) => {
  const { requestedAt, ...rest } = form;
  if (!requestedAt) return rest;
  const when = new Date(requestedAt);
  return Number.isNaN(when.getTime()) ? rest : { ...rest, requestedAt: when.toISOString() };
};
