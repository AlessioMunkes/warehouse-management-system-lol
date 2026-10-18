// ─────────────────────────────────────────────────────────────
// server/src/config/appUrl.js
//
// The web address of this app, for every link the server builds into an
// email or a redirect: invites, password resets, the Section 18A donor
// form, the Finance report, the Gmail sign-in return, saved report emails.
//
// It used to be six little functions that each read different variables
// with a different fallback. A server set up as env.example says
// (CLIENT_ORIGIN) sent invites that pointed at localhost, and Settings →
// Connections could not tell, because it read a fourth list.
//
// THE CHAIN, per kind of link:
//   1. the kind's own override, if it has one (USER_INVITE_BASE_URL,
//      PASSWORD_RESET_BASE_URL, SECTION18A_FORM_BASE_URL) — it wins
//   2. APP_BASE_URL — the one to set
//   3. the older names, in the order that kind of link read them before,
//      then any it did not read, so a server that only ever set one of
//      them keeps working with no change
//
// NOTHING SET:
//   development  http://localhost:5173
//   production   null. The server still starts. The caller logs a clear
//                error at send time and does not send a broken link.
//
// resolveAppBaseUrl is pure (it takes the environment) so Settings →
// Connections and the tests can ask the same question the code asks.
// ─────────────────────────────────────────────────────────────

export const DEV_DEFAULT_URL = 'http://localhost:5173';

const FRONT_END_NAMES = ['CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN'];

// `own`: the override only this kind reads. `legacy`: older names, in
// the order this kind read them before this helper existed.
export const LINK_KINDS = {
  invite: {
    label: 'Invite links',
    detail: 'Where the link in an invite email opens.',
    own: 'USER_INVITE_BASE_URL',
    legacy: FRONT_END_NAMES,
  },
  passwordReset: {
    label: 'Password reset links',
    detail: 'Where the link in a password reset email opens.',
    own: 'PASSWORD_RESET_BASE_URL',
    legacy: FRONT_END_NAMES,
  },
  section18a: {
    label: 'Section 18A form links',
    detail: 'Where donors complete their Section 18A details.',
    own: 'SECTION18A_FORM_BASE_URL',
    legacy: FRONT_END_NAMES,
  },
  financeReport: {
    label: 'Finance report links',
    detail: 'Where the link in the Finance report email opens.',
    own: null,
    legacy: ['CLIENT_ORIGIN', 'CLIENT_URL', 'FRONTEND_URL'],
  },
  gmailReturn: {
    label: 'Gmail sign-in return',
    detail: 'Where Google sends you back after you connect Gmail.',
    own: null,
    legacy: ['CLIENT_ORIGIN', 'CLIENT_URL', 'FRONTEND_URL'],
  },
  savedReport: {
    label: 'Saved report email links',
    detail: 'Where "Open Operations reports" goes in a saved report email.',
    own: null,
    legacy: ['CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN'],
  },
};

const clean = (value) => String(value ?? '').trim().replace(/\/+$/, '');

/** The variable names read for a kind, first one wins. */
export const chainFor = (kind) => {
  const def = LINK_KINDS[kind];
  if (!def) throw new Error(`Unknown link kind "${kind}".`);
  return [def.own, 'APP_BASE_URL', ...def.legacy].filter(Boolean);
};

/**
 * Which address a kind of link uses, and where it came from.
 * @returns {{ kind: string, label: string, url: string|null,
 *   source: string|null, isDevDefault: boolean }}
 *   `url` is null only in production with nothing set.
 */
export const resolveAppBaseUrl = (kind, env = process.env) => {
  const def = LINK_KINDS[kind];
  if (!def) throw new Error(`Unknown link kind "${kind}".`);

  for (const name of chainFor(kind)) {
    const url = clean(env[name]);
    if (url) return { kind, label: def.label, url, source: name, isDevDefault: false };
  }
  if (env.NODE_ENV === 'production') {
    return { kind, label: def.label, url: null, source: null, isDevDefault: false };
  }
  return { kind, label: def.label, url: DEV_DEFAULT_URL, source: null, isDevDefault: true };
};

/** The message logged when a link cannot be built. */
export const missingAddressMessage = (kind) =>
  `No web address is set for ${LINK_KINDS[kind].label.toLowerCase()}. `
  + 'Set APP_BASE_URL on the server (for example https://your-site.example).';

/**
 * The address for a kind of link, or null if there is none to use. When
 * null, this has already logged why: the caller only has to not send.
 */
export const appBaseUrl = (kind) => {
  const { url } = resolveAppBaseUrl(kind);
  if (!url) console.error(`[links] ${missingAddressMessage(kind)}`);
  return url;
};

export default appBaseUrl;
