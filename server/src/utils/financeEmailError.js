// ─────────────────────────────────────────────────────────────
// server/src/utils/financeEmailError.js
//
// The Finance PO email can fail for reasons whose raw text is not for
// the browser (Google API messages, hostnames, token errors). Anything
// stored in purchase_orders.finance_email_error, or sent to the client,
// goes through here first: known failures become one short fixed
// sentence, everything else the generic one. The raw message is logged
// server-side by the caller, never kept.
//
// Idempotent: a message that is already one of the safe ones maps to
// itself, so it can be applied again on read.
// ─────────────────────────────────────────────────────────────

export const FINANCE_EMAIL_ERRORS = {
  noRecipient:  'Ask an admin to add a Finance email address in Settings, then resend.',
  notConnected: 'Ask an admin to connect Gmail in Settings, then resend.',
  unreachable:  "The email service didn't respond. Try again.",
  generic:      "The email didn't send. Try again.",
};

// What earlier versions stored. Rows already in the database still
// hold these, so they map to the current text instead of falling
// through to the generic one.
const LEGACY = {
  'No Finance recipient saved':        FINANCE_EMAIL_ERRORS.noRecipient,
  'Gmail not connected':               FINANCE_EMAIL_ERRORS.notConnected,
  "Couldn't reach the email service":  FINANCE_EMAIL_ERRORS.unreachable,
  'Send failed':                       FINANCE_EMAIL_ERRORS.generic,
};

const SAFE = new Set(Object.values(FINANCE_EMAIL_ERRORS));

export const safeFinanceEmailError = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const text = String(raw);
  if (SAFE.has(text)) return text;
  if (LEGACY[text]) return LEGACY[text];

  if (/gmail connection|connect gmail|reconnect|not connected|invalid_grant|unauthori[sz]ed|credential|access token|oauth/i.test(text)) {
    return FINANCE_EMAIL_ERRORS.notConnected;
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|fetch failed|socket|timed? ?out|could not reach|getaddrinfo/i.test(text)) {
    return FINANCE_EMAIL_ERRORS.unreachable;
  }
  return FINANCE_EMAIL_ERRORS.generic;
};
