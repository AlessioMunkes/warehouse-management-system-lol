// ─────────────────────────────────────────────────────────────
// server/__tests__/ftsDropPoint.service.test.js
//
// Feed the Soil drop-off sites (migration 069): the public form behind
// a site's QR code, and the thank-you it sends.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TOKEN = '6f1c2b0e-8a4d-4c1e-9b7a-2d3e4f5a6b7c';
const repoMock = {
  listDropPoints: vi.fn(), createDropPoint: vi.fn(), updateDropPoint: vi.fn(), findActiveByToken: vi.fn(),
  createDropoff: vi.fn(), recordThanks: vi.fn(), listDropoffs: vi.fn(), setDropoffStatus: vi.fn(),
};
const sendMock = vi.fn();
vi.mock('../src/repositories/ftsDropPoint.repository.js', () => ({ default: repoMock }));
vi.mock('../src/services/communications.service.js', () => ({
  default: { send: (...a) => sendMock(...a) },
  outcomeOf: (r) => ({ status: r?.stubbed ? 'stubbed' : r?.sent ? 'sent' : 'failed' }),
}));

const { default: service } = await import('../src/services/ftsDropPoint.service.js');
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findActiveByToken.mockResolvedValue({ id: 3, name: 'Muizenberg pop-up', suburb: 'Muizenberg' });
  repoMock.createDropoff.mockImplementation(async (d) => ({ id: 11, ...d }));
  repoMock.recordThanks.mockResolvedValue();
  sendMock.mockResolvedValue({ sent: true });
});

describe('the public drop-off form', () => {
  it('shows only the site’s name, for a known active site', async () => {
    await expect(service.getPublicSite(TOKEN)).resolves.toEqual({ name: 'Muizenberg pop-up', suburb: 'Muizenberg' });
    repoMock.findActiveByToken.mockResolvedValueOnce(null);
    await expect(service.getPublicSite(TOKEN)).rejects.toMatchObject({ status: 404 });
    await expect(service.getPublicSite('not-a-token')).rejects.toMatchObject({ status: 404 });
  });

  it('logs the weight at the site and thanks the person on the email they gave', async () => {
    const result = await service.submitDropoff(TOKEN, { kg: '4.5', name: ' Ayesha ', email: 'Ayesha@Example.com' });
    expect(result).toEqual({ site: 'Muizenberg pop-up', kg: 4.5, thanksEmailed: true });
    expect(repoMock.createDropoff).toHaveBeenCalledWith({
      dropPointId: 3, kgCompost: 4.5, donorName: 'Ayesha', donorEmail: 'ayesha@example.com',
    });
    await flush();
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'compost_thank_you', to: 'ayesha@example.com', subject: 'Thank you for feeding the soil',
    }));
    expect(sendMock.mock.calls[0][0].text).toContain('Thank you for bringing 4.5 kg of compost to Muizenberg pop-up');
    expect(repoMock.recordThanks).toHaveBeenCalledWith(11, 'sent');
  });

  it('sends nothing without an email', async () => {
    await expect(service.submitDropoff(TOKEN, { kg: 2 })).resolves.toMatchObject({ thanksEmailed: false });
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('refuses a weight that is not a bucket of compost, and a bad email', async () => {
    for (const kg of [0, -1, 'lots', 201, 1.234]) {
      await expect(service.submitDropoff(TOKEN, { kg })).rejects.toMatchObject({ status: 400 });
    }
    await expect(service.submitDropoff(TOKEN, { kg: 3, email: 'nope' })).rejects.toMatchObject({ status: 400 });
    expect(repoMock.createDropoff).not.toHaveBeenCalled();
  });

  it('still thanks on screen when the email fails', async () => {
    sendMock.mockRejectedValueOnce(new Error('smtp down'));
    await expect(service.submitDropoff(TOKEN, { kg: 3, email: 'a@b.co' })).resolves.toMatchObject({ thanksEmailed: true });
    await flush();
    expect(repoMock.recordThanks).toHaveBeenCalledWith(11, 'failed');
  });
});

describe('staff', () => {
  it('names a new site, and refuses a name already taken', async () => {
    repoMock.createDropPoint.mockResolvedValueOnce({ id: 4 });
    await service.createDropPoint({ name: ' Kalk Bay  market ' }, 7);
    expect(repoMock.createDropPoint).toHaveBeenCalledWith({ name: 'Kalk Bay market', suburb: null, address: null, createdBy: 7 });
    repoMock.createDropPoint.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(service.createDropPoint({ name: 'Kalk Bay market' })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a drop-off that is not real, or counts it again', async () => {
    repoMock.setDropoffStatus.mockResolvedValue({ id: 11, status: 'rejected' });
    await service.setDropoffStatus('11', { status: 'rejected' }, 7);
    expect(repoMock.setDropoffStatus).toHaveBeenCalledWith(11, 'rejected', 7);
    await expect(service.setDropoffStatus(11, { status: 'deleted' })).rejects.toMatchObject({ status: 400 });
  });
});
