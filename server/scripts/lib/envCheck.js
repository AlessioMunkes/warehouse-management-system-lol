// ─────────────────────────────────────────────────────────────
// server/scripts/lib/envCheck.js
//
// The checks behind `npm run check-env`, kept free of console and
// process so they can be unit tested. checkEnv(env) looks at an
// environment (process.env, or a plain object in tests) and returns one
// line per thing worth saying, in the order of env.example's sections.
//
// It NEVER returns a value, only whether one is there and whether it
// looks right, so its output is safe to paste into a chat or a ticket.
//
//   { section, name, status, message }
//   status: 'ok' | 'missing' | 'wrong' | 'off' | 'warn'
//     missing  required and not set: the server will not work
//     wrong    set, but it cannot be right as it is
//     warn     works, but should be changed (production, leftovers)
//     off      optional and not set: that feature is switched off
//     ok       set and looks right
// ─────────────────────────────────────────────────────────────
import { parseWarehouseUrls } from '../../src/config/dbRouter.js';

const set = (v) => typeof v === 'string' && v.trim() !== '';
const isUrl = (v, protocols) => {
  try {
    const u = new URL(String(v).trim());
    return protocols.includes(u.protocol);
  } catch {
    return false;
  }
};
const isLocal = (v) => /\/\/(localhost|127\.0\.0\.1)\b/.test(String(v));
// Placeholders copied straight from env.example.
const PLACEHOLDER = /replace-with|your[-_]|your-password|uri-here|example\.(org|com)\b|CHANGE-ME/i;

// Variables an older setup had that nothing reads any more.
export const RETIRED = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT', 'FINANCE_EMAIL'];

export const checkEnv = (env) => {
  const out = [];
  const say = (section, name, status, message) => out.push({ section, name, status, message });
  const production = env.NODE_ENV === 'production';

  // ── 1. Required ─────────────────────────────────────────────
  const R = 'Required';
  if (set(env.WAREHOUSE_DB_URLS)) {
    try {
      const urls = parseWarehouseUrls(env.WAREHOUSE_DB_URLS);
      say(R, 'WAREHOUSE_DB_URLS', 'ok', `${urls.size ?? Object.keys(urls).length} warehouse database(s); DATABASE_URL is ignored.`);
    } catch (err) {
      say(R, 'WAREHOUSE_DB_URLS', 'wrong', err.message);
    }
  } else if (!set(env.DATABASE_URL)) {
    say(R, 'DATABASE_URL', 'missing', 'Not set. Paste the Supabase Session pooler string (Connect > Session pooler).');
  } else if (/\s/.test(env.DATABASE_URL.trim()) || env.DATABASE_URL !== env.DATABASE_URL.trim()) {
    say(R, 'DATABASE_URL', 'wrong', 'Has a space in it (often right after the =). Remove it.');
  } else if (!isUrl(env.DATABASE_URL, ['postgres:', 'postgresql:'])) {
    say(R, 'DATABASE_URL', 'wrong', 'Does not start with postgresql://. Copy the whole connection string.');
  } else if (PLACEHOLDER.test(env.DATABASE_URL)) {
    say(R, 'DATABASE_URL', 'wrong', 'Still the example from env.example. Put in the real connection string.');
  } else {
    say(R, 'DATABASE_URL', 'ok', 'Set, and looks like a Postgres connection string.');
  }

  if (!set(env.JWT_SECRET)) {
    say(R, 'JWT_SECRET', 'missing', 'Not set. The server will not start.');
  } else if (PLACEHOLDER.test(env.JWT_SECRET)) {
    say(R, 'JWT_SECRET', 'wrong', 'Still the example from env.example. Use a long random string.');
  } else if (env.JWT_SECRET.length < 32) {
    say(R, 'JWT_SECRET', production ? 'wrong' : 'warn', `Only ${env.JWT_SECRET.length} characters. Use at least 32 random characters.`);
  } else {
    say(R, 'JWT_SECRET', 'ok', 'Set, and long enough.');
  }

  // ── 2. Production ───────────────────────────────────────────
  const P = 'Production';
  if (!set(env.APP_BASE_URL)) {
    say(P, 'APP_BASE_URL', production ? 'missing' : 'off',
      production ? 'Not set. Emails with links (invites, password resets) are not sent.' : 'Not set. Links use http://localhost:5173.');
  } else if (!isUrl(env.APP_BASE_URL, ['http:', 'https:'])) {
    say(P, 'APP_BASE_URL', 'wrong', 'Not a web address. Use the full address, like https://batches.example.org');
  } else if (production && (isLocal(env.APP_BASE_URL) || !env.APP_BASE_URL.trim().startsWith('https://'))) {
    say(P, 'APP_BASE_URL', 'wrong', 'On a live server this must be the public https:// address, not localhost.');
  } else if (env.APP_BASE_URL.trim().endsWith('/')) {
    say(P, 'APP_BASE_URL', 'warn', 'Ends with /. Remove the trailing slash.');
  } else {
    say(P, 'APP_BASE_URL', 'ok', 'Set.');
  }
  say(P, 'NODE_ENV', production ? 'ok' : 'off', production ? 'production.' : 'Not production (fine on a laptop; the live server needs production).');
  if (production && !set(env.TRUSTED_CLIENT_IP_HEADER)) {
    say(P, 'TRUSTED_CLIENT_IP_HEADER', 'warn', 'Not set. On Render use cf-connecting-ip, or rate limits count everyone as a few visitors.');
  } else if (set(env.TRUSTED_CLIENT_IP_HEADER)) {
    say(P, 'TRUSTED_CLIENT_IP_HEADER', 'ok', 'Set.');
  }
  if (set(env.DB_SSL) && !['true', 'false', 'verify'].includes(env.DB_SSL.trim())) {
    say(P, 'DB_SSL', 'wrong', 'Use true, false or verify.');
  } else if (production && env.DB_SSL === 'false') {
    say(P, 'DB_SSL', 'warn', 'SSL is off on a live server. Only do this for a database on the same machine.');
  }

  // ── 3. Optional features ────────────────────────────────────
  const O = 'Optional';
  const group = (label, names, { offMessage, extra } = {}) => {
    const present = names.filter((n) => set(env[n]));
    if (present.length === 0) { say(O, label, 'off', offMessage ?? 'Not set: switched off.'); return false; }
    const missing = names.filter((n) => !set(env[n]));
    if (missing.length) { say(O, label, 'wrong', `Partly set. Also needs ${missing.join(', ')}.`); return false; }
    const problem = extra?.();
    if (problem) { say(O, label, problem.status ?? 'wrong', problem.message); return false; }
    say(O, label, 'ok', 'Set.');
    return true;
  };

  group('Gmail (email sending)', ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REDIRECT_URI', 'GMAIL_TOKEN_ENCRYPTION_KEY'], {
    offMessage: 'Not set: the app cannot send email. Messages are kept in Message history.',
    extra: () => {
      let key;
      try { key = Buffer.from(env.GMAIL_TOKEN_ENCRYPTION_KEY.trim(), 'base64'); } catch { key = null; }
      if (!key || key.length !== 32) return { message: 'GMAIL_TOKEN_ENCRYPTION_KEY must be base64 for 32 random bytes (see env.example).' };
      if (!isUrl(env.GMAIL_REDIRECT_URI, ['http:', 'https:'])) return { message: 'GMAIL_REDIRECT_URI is not a web address.' };
      if (production && isLocal(env.GMAIL_REDIRECT_URI)) return { message: 'GMAIL_REDIRECT_URI points at localhost on a live server.' };
      return null;
    },
  });
  if (env.EMAIL_ENABLED && ['false', '0', 'no', 'off'].includes(env.EMAIL_ENABLED.trim().toLowerCase())) {
    say(O, 'EMAIL_ENABLED', 'warn', 'Emails are recorded but NOT sent. Remove this for go-live.');
  }

  if (set(env.GEMINI_API_KEY)) say(O, 'GEMINI_API_KEY (AI help and reporting)', 'ok', 'Set.');
  else say(O, 'GEMINI_API_KEY (AI help and reporting)', 'off', 'Not set: the help assistant and the reporting question box are off.');

  group('QuickBooks', ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET', 'QUICKBOOKS_REDIRECT_URI'], {
    extra: () => {
      const mode = (env.QUICKBOOKS_ENVIRONMENT || 'sandbox').trim();
      if (!['sandbox', 'production'].includes(mode)) return { message: 'QUICKBOOKS_ENVIRONMENT must be sandbox or production.' };
      if (production && mode === 'sandbox') return { status: 'warn', message: 'Still on the sandbox. For the live company set QUICKBOOKS_ENVIRONMENT=production with the production keys.' };
      if (production && isLocal(env.QUICKBOOKS_REDIRECT_URI)) return { message: 'QUICKBOOKS_REDIRECT_URI points at localhost on a live server.' };
      return null;
    },
  });

  group('Phone notifications (VAPID)', ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'], {
    offMessage: 'Not set: no phone notifications. The bell in the app still works.',
  });

  // ── Leftovers ───────────────────────────────────────────────
  for (const name of RETIRED) {
    if (set(env[name])) say('Leftover', name, 'warn', 'Nothing reads this any more. Remove it (the database is DATABASE_URL).');
  }

  return out;
};

/** True when the server cannot work as configured. */
export const hasBlockingProblem = (lines) => lines.some((l) => l.status === 'missing' || l.status === 'wrong');
