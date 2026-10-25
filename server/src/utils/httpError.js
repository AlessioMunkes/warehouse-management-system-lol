// ─────────────────────────────────────────────────────────────
// server/src/utils/httpError.js
//
// What a person reads when a request fails. One place, so every screen
// says it the same way.
//
//   A mistake the request made (4xx)   the service's own message: it
//                                      says what to fix.
//   The database cannot be reached     503, "wait a minute and try
//                                      again". Supabase restarting or the
//                                      network dropping is not a fault in
//                                      what they did, and waiting fixes it.
//   Anything else (5xx)                what could not be done, then what
//                                      to do: try again, and tell an
//                                      administrator if it keeps happening.
//                                      The cause stays in the server log;
//                                      it can carry SQL or names.
//
// Every controller answers its errors through sendError, and so does the
// last error handler in index.js.
// ─────────────────────────────────────────────────────────────

export const DATABASE_DOWN_MESSAGE =
  'The database cannot be reached right now. Wait a minute and try again.';

const NEXT_STEP = 'Try again, and if it keeps happening, tell an administrator.';

// A lost or refused connection, a connect that timed out, the server
// shutting down: Postgres's and Node's codes for "could not reach it",
// as opposed to the database refusing a query.
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE',
  '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006',
]);

export const isDatabaseDown = (err) =>
  DB_DOWN_CODES.has(err?.code) ||
  /timeout exceeded when trying to connect|Connection terminated|connection (?:is )?(?:refused|closed)|Client has encountered a connection error/i
    .test(err?.message ?? '');

// "Could not load the stock ledger." plus what to do. A fallback written
// the old way ("Failed to retrieve X.") reads the new way.
const withNextStep = (fallback) => {
  const said = String(fallback || 'That could not be done.')
    .trim()
    .replace(/^Failed to retrieve /, 'Could not load ')
    .replace(/^Failed to /, 'Could not ')
    .replace(/([^.!?])$/, '$1.');
  return `${said} ${NEXT_STEP}`;
};

/**
 * { status, message } for an error, as the person should read it.
 *
 * @param {Error}  err       what was thrown
 * @param {string} fallback  what could not be done, for a server fault
 * @param {object} options   passThrough: 5xx statuses whose own message
 *                           was written for the reader (an outside
 *                           service being busy, say) and is shown as is
 */
export const errorReply = (err, fallback, { passThrough = [] } = {}) => {
  if (isDatabaseDown(err)) return { status: 503, message: DATABASE_DOWN_MESSAGE, retryable: true };
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status < 500) return { status, message: err.message || withNextStep(fallback) };
  if (passThrough.includes(status) && err?.message) return { status, message: err.message };
  return { status, message: withNextStep(fallback) };
};

/** Answer a failed request. Returns the response, so `return sendError(...)` reads naturally. */
export const sendError = (res, err, fallback, options) => {
  const { status, message, retryable } = errorReply(err, fallback, options);
  return res.status(status).json({ success: false, message, ...(retryable ? { retryable: true } : {}) });
};

export default { sendError, errorReply, isDatabaseDown, DATABASE_DOWN_MESSAGE };
