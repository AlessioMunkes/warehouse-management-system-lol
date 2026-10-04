// ─────────────────────────────────────────────────────────────
// server/src/features/settings/connections.service.js
//
// Settings → Connections: everything outside this server the system
// depends on, and whether each one is working right now. One check per
// connection, each with a time limit, run side by side — a slow one
// cannot hold up the rest, and one that throws reports itself as down
// rather than failing the whole page.
//
// Each check answers { id, name, status, summary, detail?, fix? }:
//   ok      — connected and working
//   warning — working, but something needs a look (recent failures)
//   down    — set up but not working: someone needs to act
//   off     — not set up on this server (a choice, not a fault)
//
// Nothing here sends an email, calls the AI or pushes to a phone: the
// checks read configuration and recent history, and for Gmail refresh
// the token, which is what proves Google still accepts it.
// ─────────────────────────────────────────────────────────────
import pool from '../../config/db.js';
import gmailService from '../../services/gmail.service.js';
import pushService from '../../services/push.service.js';
import { getAdapter } from '../../services/vmsIntegration.service.js';
import mockVMSAdapter from '../../integrations/mockVMS.adapter.js';
import vmsSyncRepo from '../../repositories/vmsSync.repository.js';
import { EMAIL_ENABLED } from '../../config/email.js';
import { LINK_KINDS, resolveAppBaseUrl } from '../../config/appUrl.js';
import { isEnabled as aiEnabled, providerName as aiProvider } from '../reporting/ai/provider.js';

const TIME_LIMIT_MS = 8000;

const withTimeLimit = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('No answer within 8 seconds.')), TIME_LIMIT_MS)),
]);

// ── The checks ───────────────────────────────────────────────

const database = async () => {
  const started = Date.now();
  await pool.query('SELECT 1');
  const ms = Date.now() - started;
  return {
    status: ms > 2000 ? 'warning' : 'ok',
    summary: ms > 2000 ? `Connected, but slow (${ms} ms)` : `Connected (${ms} ms)`,
    detail: 'Where every record is kept. If this is down, nothing else works.',
  };
};

const failedEmailsLastDay = async () => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM outbound_messages
        WHERE status = 'failed' AND attempted_at > NOW() - INTERVAL '24 hours'`,
    );
    return rows[0]?.n ?? 0;
  } catch {
    return 0;   // message history not set up yet: nothing to report
  }
};

const email = async () => {
  if (!EMAIL_ENABLED()) {
    return {
      status: 'off',
      summary: 'Sending is switched off on this server',
      detail: 'Emails are recorded in Message history but not sent (EMAIL_ENABLED is false).',
    };
  }
  const gmail = await gmailService.checkOrganisationConnection();
  if (!gmail.connected) {
    return {
      status: 'down',
      summary: 'No Gmail account connected',
      detail: 'Certificates, collection reminders, invites, password resets and Finance emails cannot go out.',
      fix: { label: 'Connect Gmail', section: 'email' },
    };
  }
  if (!gmail.working) {
    return {
      status: 'down',
      summary: `${gmail.email} — Google no longer accepts it`,
      detail: gmail.error,
      fix: { label: 'Reconnect Gmail', section: 'email' },
    };
  }
  const failed = await failedEmailsLastDay();
  return {
    status: failed > 0 ? 'warning' : 'ok',
    summary: failed > 0
      ? `Sending as ${gmail.email}; ${failed} email${failed === 1 ? '' : 's'} failed in the last day`
      : `Sending as ${gmail.email}`,
    detail: 'Certificates, collection reminders, invites, password resets and Finance emails.',
    fix: failed > 0 ? { label: 'Open message history', screen: 'messageHistory' } : undefined,
  };
};

const assistant = async () => (aiEnabled()
  ? {
    status: 'ok',
    summary: `Set up (${aiProvider()})`,
    detail: 'The help assistant and Ask in Operations reports. Without it, both fall back to matching keywords.',
  }
  : {
    status: 'off',
    summary: 'Not set up — answers come from keyword matching',
    detail: 'Add a GEMINI_API_KEY to the server to turn on the help assistant’s understanding and report questions.',
  });

const push = async () => (pushService.publicKey()
  ? {
    status: 'ok',
    summary: 'Set up',
    detail: 'Tells warehouse staff’s phones when new pallets are ready to pack.',
  }
  : {
    status: 'off',
    summary: 'Not set up',
    detail: 'Phone notifications need VAPID keys on the server. The bell inside the app works without them.',
  });

const volunteerSystem = async () => {
  if (getAdapter() === mockVMSAdapter) {
    return {
      status: 'off',
      summary: 'No live volunteer system connected',
      detail: 'Event bookings are kept here only; they are not published to an outside volunteer system.',
    };
  }
  const failed = (await vmsSyncRepo.findFailed({ limit: 100 })).length;
  return {
    status: failed > 0 ? 'warning' : 'ok',
    summary: failed > 0 ? `${failed} event${failed === 1 ? '' : 's'} failed to sync` : 'Connected',
    detail: 'Publishes volunteer event bookings to the volunteer management system.',
    fix: failed > 0 ? { label: 'Open volunteer events', screen: 'volunteers' } : undefined,
  };
};

// One line per kind of link, from the same helper the code that builds the
// link asks (config/appUrl.js), so this cannot say "fine" while the link
// points somewhere else.
const linkCheck = (kind) => async () => {
  const { url, source, isDevDefault } = resolveAppBaseUrl(kind);
  const { detail } = LINK_KINDS[kind];
  if (!url) {
    return {
      status: 'down',
      summary: 'No web address set',
      detail: `${detail} Set APP_BASE_URL on the server.`,
    };
  }
  const local = /localhost|127\.0\.0\.1/.test(url);
  if (local && process.env.NODE_ENV === 'production') {
    return {
      status: 'down',
      summary: `Points at ${url}`,
      detail: `${detail} A link to this address would not open for anyone else. Set APP_BASE_URL.`,
    };
  }
  if (isDevDefault) {
    return { status: 'warning', summary: `Using the development address ${url}`, detail };
  }
  return {
    status: local ? 'warning' : 'ok',
    summary: `Points at ${url}`,
    detail: `${detail} Read from ${source}.`,
  };
};

const scheduledJobs = async () => {
  const off = [
    process.env.ECD_REMINDER_SCHEDULER === 'false' ? 'collection reminders' : null,
    process.env.SAVED_REPORTS_SCHEDULER === 'false' ? 'saved report emails' : null,
  ].filter(Boolean);
  return off.length
    ? {
      status: 'warning',
      summary: `Switched off: ${off.join(' and ')}`,
      detail: 'These normally run by themselves every day. Turned off on this server, nothing goes out on schedule.',
    }
    : {
      status: 'ok',
      summary: 'Running',
      detail: 'Collection reminders, expiry warnings and saved report emails go out by themselves.',
    };
};

const CHECKS = [
  { id: 'database',  name: 'Database',              run: database },
  { id: 'email',     name: 'Email (Gmail)',         run: email },
  ...Object.entries(LINK_KINDS).map(([kind, { label }]) => ({ id: `link-${kind}`, name: label, run: linkCheck(kind) })),
  { id: 'jobs',      name: 'Scheduled jobs',        run: scheduledJobs },
  { id: 'assistant', name: 'AI assistant',          run: assistant },
  { id: 'push',      name: 'Phone notifications',   run: push },
  { id: 'vms',       name: 'Volunteer system',      run: volunteerSystem },
];

/** Every connection's health, checked now. */
export const checkConnections = async () => {
  const results = await Promise.all(CHECKS.map(async ({ id, name, run }) => {
    try {
      return { id, name, ...(await withTimeLimit(run())) };
    } catch (err) {
      return { id, name, status: 'down', summary: 'Could not be checked', detail: err.message };
    }
  }));
  return { checkedAt: new Date().toISOString(), connections: results };
};

export default { checkConnections };
