// ─────────────────────────────────────────────────────────────
// server/__tests__/gmail.sendScope.test.js
//
// Google's consent screen lets "Send email on your behalf" be left
// unticked. Such a connection signs in and refreshes, and only fails
// when it sends ("Request had insufficient authentication scopes").
// It must not be saved, and Settings → Connections must not call it
// working.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

const oauth = { getToken: vi.fn(), setCredentials: vi.fn(), generateAuthUrl: vi.fn(() => 'https://accounts.google.com/x'), refreshAccessToken: vi.fn(), credentials: {} };
vi.mock('googleapis', () => ({ google: { auth: { OAuth2: vi.fn(function OAuth2() { return oauth; }) }, gmail: vi.fn() } }));

const KEY = crypto.randomBytes(32);
vi.mock('../src/config/gmail.js', () => ({
  getGmailConfig: () => ({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x/cb', scopes: ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email', 'profile'] }),
  OAUTH_STATE_TTL_MS: 600000,
  parseEncryptionKey: () => KEY,
}));

const repo = { upsertConnection: vi.fn(), findLatestConnection: vi.fn() };
vi.mock('../src/repositories/gmail.repository.js', () => ({ default: repo }));

const { default: gmailService, canSend, NO_SEND_MESSAGE } = await import('../src/services/gmail.service.js');

const SEND = 'https://www.googleapis.com/auth/gmail.send';
const PROFILE_ONLY = 'https://www.googleapis.com/auth/userinfo.email openid https://www.googleapis.com/auth/userinfo.profile';
const idToken = `x.${Buffer.from(JSON.stringify({ email: 'warehouse@example.org', name: 'Warehouse' })).toString('base64')}.y`;

beforeEach(() => {
  vi.clearAllMocks();
  oauth.credentials = {};
});

const connect = async (scope) => {
  const { state } = gmailService.startConnectFlow({ initiatedByUserId: 1 });
  oauth.getToken.mockResolvedValue({ tokens: { access_token: 'a', refresh_token: 'r', scope, id_token: idToken, expiry_date: Date.now() + 3600000 } });
  return gmailService.handleOAuthCallback({ code: 'c', state });
};

describe('canSend', () => {
  it('needs gmail.send among the granted scopes', () => {
    expect(canSend(`${SEND} openid`)).toBe(true);
    expect(canSend(PROFILE_ONLY)).toBe(false);
    expect(canSend(null)).toBe(false);
  });
});

describe('connecting Gmail', () => {
  it('saves a connection that may send', async () => {
    await expect(connect(`${SEND} openid`)).resolves.toEqual({ connected: true, email: 'warehouse@example.org' });
    expect(repo.upsertConnection).toHaveBeenCalledTimes(1);
  });

  it('refuses one made with "Send email on your behalf" unticked, and keeps the one there was', async () => {
    await expect(connect(PROFILE_ONLY)).rejects.toMatchObject({ reason: 'no_send', message: NO_SEND_MESSAGE });
    expect(repo.upsertConnection).not.toHaveBeenCalled();
  });
});

describe('Settings → Connections', () => {
  // Stored the way the service stores tokens (AES-256-GCM, "v1:iv:tag:data").
  const encrypt = (value) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
  };
  const stored = (scope) => ({
    gmail_email: 'warehouse@example.org', scope, access_token_expires_at: new Date(Date.now() + 3600000),
    access_token_encrypted: encrypt('a'), refresh_token_encrypted: encrypt('r'), updated_at: new Date(),
  });

  it('calls a connection that cannot send not working, with what to do', async () => {
    repo.findLatestConnection.mockResolvedValue(stored(PROFILE_ONLY));
    await expect(gmailService.checkOrganisationConnection())
      .resolves.toMatchObject({ connected: true, working: false, error: NO_SEND_MESSAGE });
  });

  it('calls one that can send working', async () => {
    repo.findLatestConnection.mockResolvedValue(stored(`${SEND} openid`));
    await expect(gmailService.checkOrganisationConnection()).resolves.toMatchObject({ connected: true, working: true });
  });
});
