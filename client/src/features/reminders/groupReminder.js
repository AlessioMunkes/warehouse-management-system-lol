// ─────────────────────────────────────────────────────────────
// client/src/features/reminders/groupReminder.js
//
// ONE MESSAGE FOR A GROUP (Collection reminders)
// The reminders go to each centre one by one. Many centres are also in
// a WhatsApp group or on a broadcast list, so the same reminder can go
// out once, naming every centre collecting tomorrow: copied, or opened
// in WhatsApp to choose the group. Sending it is still the person's own
// tap, as with the one-by-one reminders.
// ─────────────────────────────────────────────────────────────
export const groupReminderMessage = (names, dateLabel) => [
  'Hello everyone,',
  `This is a reminder that these centres collect from Ladles of Love tomorrow, ${dateLabel}:`,
  names.map((n) => `• ${n}`).join('\n'),
  'Please make sure someone is there to collect. If you cannot make it, let us know as soon as possible.',
  'Kind regards,\nLadles of Love',
].join('\n\n');
