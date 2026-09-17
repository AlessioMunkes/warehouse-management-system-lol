// -------------------------------------------------------------
// server/src/services/gmail.service.js
//
// Gmail OAuth connection flow only:
// - build authorize URL
// - validate callback state
// - exchange code for tokens
// - persist encrypted credentials
// - refresh access tokens
// - provide safe connection status
// -------------------------------------------------------------
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { getGmailConfig, OAUTH_STATE_TTL_MS, parseEncryptionKey } from '../config/gmail.js';
import gmailRepo from '../repositories/gmail.repository.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const stateStore = new Map();

const cleanupExpiredStates = () => {
  const now = Date.now();
  for (const [state, meta] of stateStore.entries()) {
    if (meta.expiresAt <= now) stateStore.delete(state);
  }
};

const generateState = () => crypto.randomBytes(32).toString('hex');

const encryptSecret = (value) => {
  const key = parseEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSecret = (stored) => {
  const key = parseEncryptionKey();
  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    fail(500, 'Stored credential is corrupt or uses an unsupported format.');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const encrypted = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

const getOAuth2Client = (config = getGmailConfig()) => {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
};

const startConnectFlow = ({ initiatedByUserId } = {}) => {
  cleanupExpiredStates();

  const config = getGmailConfig();
  const state = generateState();
  stateStore.set(state, {
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    initiatedByUserId: initiatedByUserId ? String(initiatedByUserId) : null,
  });

  const oauth2Client = getOAuth2Client(config);
  const redirectUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.scopes,
    state,
    prompt: 'consent',
  });

  return { state, redirectUrl };
};

const handleOAuthCallback = async ({ code = null, state = null, oauthError = null } = {}) => {
  cleanupExpiredStates();

  if (oauthError) {
    fail(400, 'Gmail authorization was declined or failed.');
  }

  if (!state) {
    fail(400, 'Missing OAuth state. Please start the Gmail connection again.');
  }

  const tracked = stateStore.get(state);
  stateStore.delete(state);

  if (!tracked || tracked.expiresAt <= Date.now()) {
    fail(400, 'OAuth state expired or is no longer valid. Please reconnect Gmail.');
  }

  if (!code) {
    fail(400, 'Missing OAuth authorization code from Gmail callback.');
  }

  const config = getGmailConfig();
  const oauth2Client = getOAuth2Client(config);

  console.log("STEP 1 - Before token exchange");
  console.time("tokenExchange");
  let tokenResponse;
  try {
    tokenResponse = await oauth2Client.getToken(code);
    console.timeEnd("tokenExchange");
    console.log("STEP 1 COMPLETE");
  } catch (err) {
    console.timeEnd("tokenExchange");
    console.error("FAILED AT TOKEN EXCHANGE");
    console.error(err);
    throw err;
  }

  const tokens = tokenResponse.tokens;
  if (!tokens.access_token || !tokens.refresh_token) {
    fail(502, 'Gmail OAuth token exchange returned an invalid response.');
  }

  const now = Date.now();
  const accessTokenExpiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(now + 3600 * 1000);

  console.log("STEP 2 - Setting OAuth client credentials");
  oauth2Client.setCredentials(tokens);
  console.log("STEP 2 COMPLETE");

  let gmailEmail = null;
  let displayName = null;
  let hasIdToken = false;

  console.log("Decoding ID token...");
  if (tokens.id_token) {
    hasIdToken = true;
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split('.')[1], 'base64').toString('utf8')
      );
      if (payload.name) displayName = payload.name;
      if (payload.email) gmailEmail = payload.email;
    } catch {
      // Non-fatal: display name defaults to null and can be set in the UI.
    }
  }
  console.log({
    email: gmailEmail,
    displayName,
    hasIdToken,
  });

  if (!gmailEmail) {
    console.log("STEP 3 - Fetching Gmail profile");
    console.time("gmailProfile");
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      console.timeEnd("gmailProfile");
      console.log("STEP 3 COMPLETE");
      gmailEmail = profile.data.emailAddress || null;
    } catch (err) {
      console.timeEnd("gmailProfile");
      console.error("FAILED AT GMAIL PROFILE");
      console.error(err);
      throw err;
    }
  }

  console.log("STEP 4 - Saving Gmail connection");
  console.time("upsertConnection");
  try {
    await gmailRepo.upsertConnection({
      gmailEmail,
      displayName,
      tokenType: String(tokens.token_type || 'bearer'),
      scope: String(tokens.scope || config.scopes.join(' ')),
      accessTokenEncrypted: encryptSecret(tokens.access_token),
      refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
      accessTokenExpiresAt,
      refreshTokenExpiresAt: null,
      connectedByUserId: tracked.initiatedByUserId,
    });
    console.timeEnd("upsertConnection");
    console.log("STEP 4 COMPLETE");
  } catch (err) {
    console.timeEnd("upsertConnection");
    console.error("FAILED AT UPSERT CONNECTION");
    console.error(err);
    throw err;
  }

  const saved = await gmailRepo.findConnectionByUserId(tracked.initiatedByUserId);
  console.log("SAVED CONNECTION AFTER UPSERT:");
  console.log(saved);

  console.log("Returning success response");
  return { connected: true, email: gmailEmail };
};

const getOAuth2ClientForConnection = async (connection) => {
  const config = getGmailConfig();
  const oauth2Client = getOAuth2Client(config);
  oauth2Client.setCredentials({
    access_token: decryptSecret(connection.access_token_encrypted),
    refresh_token: decryptSecret(connection.refresh_token_encrypted),
    expiry_date: connection.access_token_expires_at
      ? new Date(connection.access_token_expires_at).getTime()
      : null,
  });

  if (connection.access_token_expires_at) {
    const expiresAt = new Date(connection.access_token_expires_at).getTime();
    if (Date.now() >= expiresAt - 60 * 1000) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        const newAccessToken = credentials.access_token;
        const newExpiry = credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000);

        await gmailRepo.upsertConnection({
          gmailEmail: connection.gmail_email,
          tokenType: String(credentials.token_type || 'bearer'),
          scope: String(credentials.scope || connection.scope),
          accessTokenEncrypted: encryptSecret(newAccessToken),
          refreshTokenEncrypted: connection.refresh_token_encrypted,
          accessTokenExpiresAt: newExpiry,
          refreshTokenExpiresAt: null,
          connectedByUserId: connection.connected_by_user_id,
        });

        oauth2Client.setCredentials({
          access_token: newAccessToken,
          refresh_token: decryptSecret(connection.refresh_token_encrypted),
          expiry_date: newExpiry.getTime(),
        });
      } catch (err) {
        fail(502, 'Failed to refresh Gmail access token. Please reconnect Gmail.');
      }
    }
  }

  return oauth2Client;
};

const getOAuth2ClientWithCredentials = async (userId) => {
  const connection = await gmailRepo.findConnectionByUserId(userId);
  if (!connection) {
    fail(404, 'No Gmail connection found. Please connect Gmail first.');
  }
  return getOAuth2ClientForConnection(connection);
};

const getValidAccessToken = async (userId) => {
  const oauth2Client = await getOAuth2ClientWithCredentials(userId);
  return oauth2Client.credentials.access_token;
};

const disconnect = async (userId) => {
  const result = await gmailRepo.deleteConnectionByUserId(userId);
  return { disconnected: Boolean(result) };
};

const getConnectionStatus = async (userId) => {
  const connection = await gmailRepo.findConnectionByUserId(userId);
  if (!connection) {
    return { connected: false };
  }

  return {
    connected: true,
    email: connection.gmail_email,
    displayName: connection.display_name || null,
    scope: connection.scope,
    connectedAt: connection.created_at,
    updatedAt: connection.updated_at,
  };
};

const encodeMimePart = (value) => Buffer.from(String(value || ''), 'utf8').toString('base64');

const toBase64Url = (str) => {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// Base64 with the 76-char line wrapping MIME requires (used for attachments).
const toWrappedBase64 = (buffer) => {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64.replace(/(.{76})/g, '$1\r\n');
};

const buildBodyPart = ({ text, html, boundary }) => {
  if (html) {
    const lines = [
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      text.replace(/=/g, '=3D').replace(/\n/g, '\r\n'),
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      encodeMimePart(html),
      `--${boundary}--`,
      '',
    ];
    return lines.join('\r\n');
  }

  const lines = [
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    text.replace(/=/g, '=3D').replace(/\n/g, '\r\n'),
    '',
  ];
  return lines.join('\r\n');
};

const buildAttachmentParts = (attachments = []) =>
  attachments
    .map((att) => {
      const filename = String(att.filename || 'attachment').replace(/["\r\n]/g, '');
      const contentType = att.contentType || 'application/octet-stream';
      const lines = [
        `Content-Type: ${contentType}; name="${filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${filename}"`,
        '',
        toWrappedBase64(att.content),
        '',
      ];
      return lines.join('\r\n');
    })
    .join('');

const buildRawMimeMessage = ({ from = null, to, subject, text, html = null, attachments = [] }) => {
  const altBoundary = 'wms_ladles_alt_' + crypto.randomBytes(12).toString('hex');
  const bodyPart = buildBodyPart({ text, html, boundary: altBoundary });

  const headerLines = [`To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0'];
  if (from) headerLines.unshift(`From: ${from}`);

  if (!attachments.length) {
    return [...headerLines, bodyPart, ''].join('\r\n');
  }

  const mixedBoundary = 'wms_ladles_mix_' + crypto.randomBytes(12).toString('hex');
  const lines = [
    ...headerLines,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    bodyPart,
    `--${mixedBoundary}`,
    buildAttachmentParts(attachments),
    `--${mixedBoundary}--`,
    '',
  ];
  return lines.join('\r\n');
};

const sendEmail = async ({ to, subject, text, html = null, attachments = [] }, initiatedByUserId = null) => {
  // With a userId, send as that admin's connection. Without one (the
  // system-side donation email flows) send as the organisation account:
  // the most recently connected Gmail connection.
console.log("===== SEND EMAIL =====");
console.log("User ID:", initiatedByUserId);

  const connection = initiatedByUserId
    ? await gmailRepo.findConnectionByUserId(initiatedByUserId)
    : await gmailRepo.findLatestConnection();
    console.log ("Connection: ", connection);

  if (!connection) {
    fail(
      404,
      initiatedByUserId
        ? 'No Gmail connection found. Please connect Gmail first.'
        : 'No organisation Gmail account is connected. An admin must connect Gmail first.'
    );
  }

  const gmailEmail = connection.gmail_email;
  if (!gmailEmail) {
    fail(
      503,
      'The connected Gmail account has no email address on record. Please reconnect Gmail.'
    );
  }

  // Build the From header from the configured display name + connected
  // email. Falls back to the email address alone when no display name set.
  const fromName = connection.display_name || gmailEmail.split('@')[0] || null;
  const fromHeader = fromName ? `${fromName} <${gmailEmail}>` : `<${gmailEmail}>`;

  const oauth2Client = await getOAuth2ClientForConnection(connection);

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const mimeMessage = buildRawMimeMessage({ from: fromHeader, to, subject, text, html, attachments });
  const raw = toBase64Url(mimeMessage);

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return { sent: true, from: fromHeader, messageId: res.data.id || null, threadId: res.data.threadId || null };
  } catch (err) {
  console.error("========== GMAIL SEND FAILED ==========");
  console.error("Message:", err.message);
  console.error("Code:", err.code);
  console.error("Status:", err.status);
  console.error("Errors:", err.errors);
  console.error("Response:", err.response?.data);
  console.error(err.stack);

  fail(502, err.message || "Gmail API send failed.");
}
};

const saveDisplayName = async (userId, displayName) => {
  // Validate the display name before persisting.
  const cleaned = String(displayName || '').trim().slice(0, 255);
  if (!cleaned) {
    fail(400, 'Display name cannot be empty.');
  }

  const existing = await gmailRepo.findConnectionByUserId(userId);
  if (!existing) {
    fail(404, 'No Gmail connection found. Please connect Gmail first.');
  }

  const updated = await gmailRepo.updateDisplayNameByUserId(userId, cleaned);
  return {
    displayName: updated.display_name,
    email: updated.gmail_email,
    updatedAt: updated.updated_at,
  };
};

export default {
  startConnectFlow,
  handleOAuthCallback,
  getValidAccessToken,
  getOAuth2ClientWithCredentials,
  getConnectionStatus,
  disconnect,
  sendEmail,
  saveDisplayName,
};

