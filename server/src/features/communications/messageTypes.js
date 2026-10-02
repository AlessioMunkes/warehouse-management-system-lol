// ─────────────────────────────────────────────────────────────
// server/src/features/communications/messageTypes.js
//
// Every kind of message the system sends, named once. The key is what
// outbound_messages.type stores; the label is what the Message history
// screen shows in its type filter; `related` is the record type a
// message of this kind points back to.
//
// A sender passes one of these keys to communications.send. An unknown
// key is refused there, so the history never fills with spellings
// nobody can filter on.
// ─────────────────────────────────────────────────────────────

export const MESSAGE_TYPES = Object.freeze({
  user_invite:            { label: 'Account invite',            related: 'user_invite' },
  password_reset:         { label: 'Password reset',            related: 'password_reset' },
  purchase_order_finance: { label: 'Purchase order to finance', related: 'purchase_order' },
  finance_report_link:    { label: 'Finance report link',       related: 'finance_report_link' },
  collection_reminder:    { label: 'Collection reminder',       related: 'ecd_collection_reminder' },
  donation_thank_you:     { label: 'Donation thank-you',        related: 'donation' },
  section_18a:            { label: 'Section 18A certificate',   related: 'donation' },
  section_18a_handoff:    { label: 'Section 18A details to finance', related: 'donation' },
  scheduled_report:       { label: 'Scheduled report',          related: 'saved_report' },
  test_email:             { label: 'Test email',                related: null },
});

export const isMessageType = (type) => Object.prototype.hasOwnProperty.call(MESSAGE_TYPES, type);

export default MESSAGE_TYPES;
