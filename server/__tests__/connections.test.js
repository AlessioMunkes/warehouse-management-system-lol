// ─────────────────────────────────────────────────────────────
// server/__tests__/connections.test.js
//
// Settings → Connections (features/settings/connections.service.js):
// each outside service reports ok / warning / down / off, and one that
// fails or hangs never takes the others down with it.
// ─────────────────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMock = { query: vi.fn() };
const gmailMock = { checkOrganisationConnection: vi.fn() };
const pushMock = { publicKey: vi.fn() };
const vmsSyncMock = { findFailed: vi.fn() };
const mockAdapter = { publishEventBooking: vi.fn() };
const vmsMock = { getAdapter: vi.fn(() => mockAdapter) };
const emailConfig = { EMAIL_ENABLED: vi.fn(() => true) };
const aiMock = { isEnabled: vi.fn(() => false), providerName: vi.fn(() => 'google:gemini') };

vi.mock('../src/config/db.js', () => ({ default: poolMock }));
vi.mock('../src/services/gmail.service.js', () => ({ default: gmailMock }));
vi.mock('../src/services/push.service.js', () => ({ default: pushMock }));
vi.mock('../src/repositories/vmsSync.repository.js', () => ({ default: vmsSyncMock }));
vi.mock('../src/integrations/mockVMS.adapter.js', () => ({ default: mockAdapter }));
vi.mock('../src/services/vmsIntegration.service.js', () => ({ getAdapter: vmsMock.getAdapter, default: vmsMock }));
vi.mock('../src/config/email.js', () => ({ EMAIL_ENABLED: emailConfig.EMAIL_ENABLED }));
vi.mock('../src/features/reporting/ai/provider.js', () => ({ isEnabled: aiMock.isEnabled, providerName: aiMock.providerName }));

const { checkConnections } = await import('../src/features/settings/connections.service.js');

const byId = async () => Object.fromEntries((await checkConnections()).connections.map((c) => [c.id, c]));

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockResolvedValue({ rows: [{ n: 0 }] });
  gmailMock.checkOrganisationConnection.mockResolvedValue({ connected: true, working: true, email: 'ops@batches.test' });
  pushMock.publicKey.mockReturnValue(null);
  vmsMock.getAdapter.mockReturnValue(mockAdapter);
  emailConfig.EMAIL_ENABLED.mockReturnValue(true);
  aiMock.isEnabled.mockReturnValue(false);
});

describe('Settings → Connections', () => {
  it('checks every connection, with when it checked', async () => {
    const result = await checkConnections();
    expect(result.checkedAt).toBeTruthy();
    expect(result.connections.map((c) => c.id)).toEqual(['database', 'email', 'links', 'jobs', 'assistant', 'push', 'vms']);
  });

  it('reports the database connected', async () => {
    expect((await byId()).database.status).toBe('ok');
  });

  it('reports the database down, without failing the rest', async () => {
    poolMock.query.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const all = await byId();
    expect(all.database).toMatchObject({ status: 'down', detail: 'connect ECONNREFUSED' });
    expect(all.email.status).toBe('ok');
  });

  it('names the Gmail account it sends as', async () => {
    expect((await byId()).email).toMatchObject({ status: 'ok', summary: 'Sending as ops@batches.test' });
  });

  it('says Gmail is down when no account is connected, and how to fix it', async () => {
    gmailMock.checkOrganisationConnection.mockResolvedValue({ connected: false });
    expect((await byId()).email).toMatchObject({ status: 'down', fix: { section: 'email' } });
  });

  it('says Gmail is down when Google no longer accepts the account', async () => {
    gmailMock.checkOrganisationConnection.mockResolvedValue({
      connected: true, working: false, email: 'ops@batches.test', error: 'Please reconnect Gmail.',
    });
    expect((await byId()).email).toMatchObject({ status: 'down', fix: { label: 'Reconnect Gmail' } });
  });

  it('warns about emails that failed in the last day', async () => {
    poolMock.query.mockImplementation(async (sql) => (/outbound_messages/.test(sql) ? { rows: [{ n: 3 }] } : { rows: [] }));
    expect((await byId()).email).toMatchObject({ status: 'warning', fix: { screen: 'messageHistory' } });
  });

  it('calls email off, not down, when sending is switched off', async () => {
    emailConfig.EMAIL_ENABLED.mockReturnValue(false);
    expect((await byId()).email.status).toBe('off');
    expect(gmailMock.checkOrganisationConnection).not.toHaveBeenCalled();
  });

  it('calls the AI, phone notifications and the volunteer system off when not set up', async () => {
    const all = await byId();
    expect(all.assistant.status).toBe('off');
    expect(all.push.status).toBe('off');
    expect(all.vms.status).toBe('off');
  });

  it('reports them ok once set up', async () => {
    aiMock.isEnabled.mockReturnValue(true);
    pushMock.publicKey.mockReturnValue('BPk…');
    vmsMock.getAdapter.mockReturnValue({ publishEventBooking: vi.fn() });
    vmsSyncMock.findFailed.mockResolvedValue([]);
    const all = await byId();
    expect(all.assistant.status).toBe('ok');
    expect(all.push.status).toBe('ok');
    expect(all.vms.status).toBe('ok');
  });

  it('reports a check that throws as down, with its reason', async () => {
    gmailMock.checkOrganisationConnection.mockRejectedValue(new Error('gmail_connections is missing'));
    expect((await byId()).email).toMatchObject({ status: 'down', summary: 'Could not be checked', detail: 'gmail_connections is missing' });
  });
});
