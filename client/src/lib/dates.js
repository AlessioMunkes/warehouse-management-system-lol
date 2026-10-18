// ─────────────────────────────────────────────────────────────
// src/lib/dates.js
//
// The date formats most lists and panels share, so a date reads the
// same on every screen. All South African English; an empty value is
// shown as "-".
//
// A screen with a format of its own (a printed note, a chart axis, a
// day of the week) keeps it beside the screen. These are only the ones
// that were copied word for word into many files.
// ─────────────────────────────────────────────────────────────

const SHORT_DATE = { day: 'numeric', month: 'short', year: 'numeric' };

/** "05 Mar 2026" in the browser's time zone. */
export const formatShortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', SHORT_DATE) : '-';

/** "05 Mar 2026, 11:07" in the browser's time zone. */
export const formatShortDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-ZA', { ...SHORT_DATE, hour: '2-digit', minute: '2-digit' }) : '-';

/**
 * A calendar day ("2026-03-05") as "05 Mar 2026". Read as UTC so the
 * day never shifts with the browser's time zone.
 */
export const formatCalendarDay = (day) =>
  day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', { ...SHORT_DATE, timeZone: 'UTC' }) : '-';
