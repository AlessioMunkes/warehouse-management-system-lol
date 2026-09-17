// -------------------------------------------------------------
// server/src/config/gmail.js
//
// Gmail OAuth environment configuration.
// -------------------------------------------------------------
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const getGmailConfig = () => {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const err = new Error(
      'Gmail OAuth is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REDIRECT_URI in the server environment.'
    );
    err.status = 503;
    throw err;
  }

  const scopes = String(process.env.GMAIL_SCOPES || 'https://www.googleapis.com/auth/gmail.send openid email profile')
    .split(/[\s,]+/)
    .filter(Boolean);

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: scopes.length ? scopes : ['https://www.googleapis.com/auth/gmail.send'],
  };
};

// Base64-encoded 32-byte key for AES-256-GCM token encryption.
export const parseEncryptionKey = () => {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    const err = new Error(
      'GMAIL_TOKEN_ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
    err.status = 503;
    throw err;
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    const err = new Error(
      'GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of 32 random bytes).'
    );
    err.status = 503;
    throw err;
  }

  return key;
};
