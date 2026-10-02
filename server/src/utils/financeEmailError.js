// ─────────────────────────────────────────────────────────────
// server/src/utils/financeEmailError.js
//
// The Finance PO email can fail for reasons whose raw text is not for
// the browser (Google API messages, hostnames, token errors). Anything
// stored in purchase_orders.finance_email_error, or sent to the client,
// goes through here first: known failures become one short fixed
// sentence, everything else "Send failed". The raw message is logged
// server-side by the caller, never kept.
//
// Idempotent: a message that is already one of the safe ones maps to
// itself, so it can be applied again on read.
// ─────────────────────────────────────────────────────────────

export const FINANCE_EMAIL_ERRORS = {
  noRecipient:  'No Finance recipient saved',
  notConnected: 'Gmail not connected',
  unreachable:  "Couldn't reach the email service",
  generic:      'Send failed',
};

const SAFE = new Set(Object.values(FINANCE_EMAIL_ERRORS));

export const safeFinanceEmailError = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const text = String(raw);
  if (SAFE.has(text)) return text;

  if (/gmail connection|connect gmail|reconnect|not connected|invalid_grant|unauthori[sz]ed|credential|access token|oauth/i.test(text)) {
    return FINANCE_EMAIL_ERRORS.notConnected;
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|fetch failed|socket|timed? ?out|could not reach|getaddrinfo/i.test(text)) {
    return FINANCE_EMAIL_ERRORS.unreachable;
  }
  return FINANCE_EMAIL_ERRORS.generic;
};
