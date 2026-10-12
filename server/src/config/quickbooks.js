// ─────────────────────────────────────────────────────────────
// server/src/config/quickbooks.js
//
// QuickBooks Online settings, all from the environment.
//
// THE FEATURE IS OFF UNTIL THE KEYS ARE THERE. With no
// QUICKBOOKS_CLIENT_ID the server behaves exactly as it did before the
// connection existed: Finance is emailed each order and captures it by
// hand. Nothing here throws at start-up.
//
//   QUICKBOOKS_CLIENT_ID       from the Intuit developer app
//   QUICKBOOKS_CLIENT_SECRET   from the Intuit developer app
//   QUICKBOOKS_REDIRECT_URI    https://<this server>/api/quickbooks/callback,
//                              registered on the Intuit app exactly as written
//   QUICKBOOKS_ENVIRONMENT     'sandbox' (default) or 'production'
//   QUICKBOOKS_TOKEN_ENCRYPTION_KEY
//                              base64 of 32 random bytes. Falls back to
//                              GMAIL_TOKEN_ENCRYPTION_KEY, so a server that
//                              already sends email needs no new key.
// ─────────────────────────────────────────────────────────────

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const SCOPE = 'com.intuit.quickbooks.accounting';

// Intuit's own addresses. The API host is the only one that differs
// between a sandbox company and a real one.
const HOSTS = {
  authorize: 'https://appcenter.intuit.com/connect/oauth2',
  token: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
  revoke: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
  api: {
    production: 'https://quickbooks.api.intuit.com',
    sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  },
};

// The API version asked for on every call, so a change on Intuit's side
// cannot alter the shape of a reply underneath us.
export const MINOR_VERSION = '75';

export const isConfigured = () => Boolean(
  process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET && process.env.QUICKBOOKS_REDIRECT_URI,
);

export const environment = () => (process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox');

export const getQuickbooksConfig = () => {
  if (!isConfigured()) {
    const err = new Error(
      'QuickBooks is not set up on this server. Add QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET and QUICKBOOKS_REDIRECT_URI.',
    );
    err.status = 503;
    throw err;
  }
  const env = environment();
  return {
    clientId: process.env.QUICKBOOKS_CLIENT_ID,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
    environment: env,
    authorizeUrl: HOSTS.authorize,
    tokenUrl: HOSTS.token,
    revokeUrl: HOSTS.revoke,
    apiBase: HOSTS.api[env],
  };
};

export const parseEncryptionKey = () => {
  const raw = process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY || process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    const err = new Error(
      'No token encryption key is set. Add QUICKBOOKS_TOKEN_ENCRYPTION_KEY: base64 of 32 random bytes.',
    );
    err.status = 503;
    throw err;
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    const err = new Error('The token encryption key must be base64 of exactly 32 random bytes.');
    err.status = 503;
    throw err;
  }
  return key;
};

export default { isConfigured, environment, getQuickbooksConfig, parseEncryptionKey, OAUTH_STATE_TTL_MS, SCOPE, MINOR_VERSION };
