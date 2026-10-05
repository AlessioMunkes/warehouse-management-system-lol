// ─────────────────────────────────────────────────────────────
// server/src/features/communications/communications.service.js
//
// The one way the system sends a message.
//
//   send({ type, to, subject, text, html, attachments, related, sentBy, sendAs })
//
// sentBy and sendAs are different things. sentBy is who caused the
// message, for the history. sendAs is the provider's second argument:
// gmail.service.js sends AS that user's own Gmail connection when it
// is given one, and as the latest connection when it is not. Each
// sender passes sendAs exactly as it passed it before, so no email
// starts leaving from a different account.
//
// It hands the message to email.provider.js exactly as the senders
// used to, writes one outbound_messages row with the outcome, and
// returns the provider's reply UNCHANGED — so each sender keeps its own
// handling (an invite's three-way status, the donation email log, a
// reminder's sent/failed mark) and nothing about what a person sees
// changes. Moving a sender here adds a history row; it does not alter
// the send.
//
// RECORDING NEVER BREAKS A SEND. If outbound_messages cannot be written
// — the migration not yet applied to a database, a dropped connection
// — the message has still gone (or failed) and the sender still hears
// about it. The failure to record is logged and swallowed.
//
// THE OUTCOME, IN ONE VOCABULARY. The provider answers { sent, stubbed,
// error, reason }; EMAIL_ENABLED=false answers { sent: true, stubbed:
// true }, which is not a delivery. Collapsed here to 'sent' | 'stubbed'
// | 'failed', the same three userInvite.service.js and
// passwordReset.service.js already use.
// ─────────────────────────────────────────────────────────────
import emailProvider from '../../providers/email.provider.js';
import outboundMessages from './outboundMessage.repository.js';
import { MESSAGE_TYPES, isMessageType } from './messageTypes.js';

export const outcomeOf = (result) => {
  if (result?.stubbed) return { status: 'stubbed', error: null };
  if (result?.sent === true) return { status: 'sent', error: null };
  return { status: 'failed', error: result?.error || result?.reason || 'Provider reported a failure.' };
};

const recordQuietly = async (row) => {
  try {
    await outboundMessages.record(row);
  } catch (err) {
    console.error(`[communications] Could not record a ${row.type} message:`, err.message);
  }
};

export const send = async ({
  type, to, subject, text, html, attachments, related = null, sentBy = null, sendAs,
}) => {
  if (!isMessageType(type)) {
    throw new Error(`Unknown message type "${type}". Add it to features/communications/messageTypes.js.`);
  }

  const base = {
    channel: 'email',
    type,
    recipient: Array.isArray(to) ? to.join(', ') : (to ?? null),
    subject: subject ?? null,
    relatedType: related?.type ?? MESSAGE_TYPES[type].related ?? null,
    relatedId: related?.id ?? null,
    sentBy,
  };

  let result;
  try {
    const payload = { to, subject, text, html, attachments };
    result = sendAs === undefined
      ? await emailProvider.sendEmail(payload)
      : await emailProvider.sendEmail(payload, sendAs);
  } catch (err) {
    // email.provider.js catches its own errors, so this is not
    // expected — but a sender that relied on the throw still gets it.
    await recordQuietly({ ...base, status: 'failed', error: err.message || 'Send failed.' });
    throw err;
  }

  await recordQuietly({ ...base, ...outcomeOf(result) });
  return result;
};

// ── The history ───────────────────────────────────────────────
const fail = (status, message) => Object.assign(new Error(message), { status });

const STATUSES = ['sent', 'stubbed', 'failed'];
const MAX_LIMIT = 200;

export const listMessages = async (query = {}) => {
  const type = query.type ? String(query.type) : null;
  const status = query.status ? String(query.status) : null;
  if (type && !isMessageType(type)) throw fail(400, `Unknown message type "${type}".`);
  if (status && !STATUSES.includes(status)) throw fail(400, `Status must be one of: ${STATUSES.join(', ')}.`);

  let limit = 50;
  if (query.limit !== undefined && query.limit !== '') {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw fail(400, `Limit must be a whole number from 1 to ${MAX_LIMIT}.`);
    }
  }

  let cursor = null;
  if (query.cursor) {
    try {
      cursor = JSON.parse(Buffer.from(String(query.cursor), 'base64url').toString('utf8'));
    } catch {
      throw fail(400, 'That page cursor is not valid.');
    }
    if (!cursor?.attemptedAt || !cursor?.id) throw fail(400, 'That page cursor is not valid.');
  }

  const { rows, nextCursor } = await outboundMessages.list({ type, status, limit, cursor });
  return {
    messages: rows,
    nextCursor: nextCursor ? Buffer.from(JSON.stringify(nextCursor)).toString('base64url') : null,
    types: Object.entries(MESSAGE_TYPES).map(([key, t]) => ({ key, label: t.label })),
  };
};

export default { send, listMessages, outcomeOf };
