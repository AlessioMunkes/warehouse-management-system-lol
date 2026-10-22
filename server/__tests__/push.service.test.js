// Phone notifications for the floor: who gets them, what happens when a
// phone has gone away, and that nothing breaks when push is switched off.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...a) => send(...a) },
}));

const repo = {
  save: vi.fn(), removeForUser: vi.fn(), removeByEndpoint: vi.fn(),
  markSuccess: vi.fn().mockResolvedValue(), listForRoles: vi.fn(),
};
vi.mock('../src/repositories/pushSubscription.repository.js', () => ({ default: repo }));
vi.mock('../src/config/db.js', () => ({ default: {} }));

const load = async (keys = true) => {
  vi.resetModules();
  if (keys) {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
  } else {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  }
  return (await import('../src/services/push.service.js')).default;
};

const phone = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: 'k', auth: 'a' });

beforeEach(() => {
  vi.clearAllMocks();
  repo.markSuccess.mockResolvedValue();
  repo.removeByEndpoint.mockResolvedValue();
});

describe('sending to the floor', () => {
  it('sends to every worker phone, with where a tap should go', async () => {
    const push = await load();
    repo.listForRoles.mockResolvedValue([phone(1), phone(2)]);
    send.mockResolvedValue({});

    expect(await push.notifyFloor({ title: '3 new picking slips on the floor', body: 'Open Packing' })).toBe(2);
    expect(repo.listForRoles).toHaveBeenCalledWith(['warehouse_worker']);
    const payload = JSON.parse(send.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: '3 new picking slips on the floor', url: '/noc/packing' });
  });

  it('forgets a phone the push service says is gone, and carries on', async () => {
    const push = await load();
    repo.listForRoles.mockResolvedValue([phone(1), phone(2)]);
    send.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 })).mockResolvedValueOnce({});

    expect(await push.notifyFloor({ title: 't', body: 'b' })).toBe(1);
    expect(repo.removeByEndpoint).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/1');
  });

  it('does nothing, and never throws, when push is not set up', async () => {
    const push = await load(false);
    expect(push.publicKey()).toBeNull();
    expect(await push.notifyFloor({ title: 't', body: 'b' })).toBe(0);
    expect(repo.listForRoles).not.toHaveBeenCalled();
  });
});

describe('turning alerts on', () => {
  it('saves a real subscription for the person signed in', async () => {
    const push = await load();
    await push.subscribe({ id: 5 }, { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'k', auth: 'a' } }, 'Phone');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 5, endpoint: 'https://fcm.googleapis.com/fcm/send/x' }));
  });

  it('turns away anything that is not a subscription', async () => {
    const push = await load();
    await expect(push.subscribe({ id: 5 }, { endpoint: 'http://insecure', keys: { p256dh: 'k', auth: 'a' } })).rejects.toMatchObject({ status: 400 });
    await expect(push.subscribe({ id: 5 }, { endpoint: 'https://fcm.googleapis.com/fcm/send/x' })).rejects.toMatchObject({ status: 400 });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('only accepts the browsers’ own push services, so the server cannot be aimed inward', async () => {
    const push = await load();
    const keys = { p256dh: 'k', auth: 'a' };
    for (const endpoint of [
      'https://127.0.0.1:8443/x',
      'https://localhost/x',
      'https://10.0.0.5/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user:pw@fcm.googleapis.com/x',
    ]) {
      await expect(push.subscribe({ id: 5 }, { endpoint, keys })).rejects.toMatchObject({ status: 400 });
    }
    expect(repo.save).not.toHaveBeenCalled();

    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-db5p.notify.windows.com/w/?token=abc',
    ]) {
      await push.subscribe({ id: 5 }, { endpoint, keys });
    }
    expect(repo.save).toHaveBeenCalledTimes(4);
  });

  it('never sends to an endpoint saved before the check, and forgets it', async () => {
    const push = await load();
    repo.listForRoles.mockResolvedValue([{ endpoint: 'https://127.0.0.1/x', p256dh: 'k', auth: 'a' }, phone(1)]);
    send.mockResolvedValue({});

    expect(await push.notifyFloor({ title: 't', body: 'b' })).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/1');
    expect(send.mock.calls[0][2]).toMatchObject({ timeout: expect.any(Number) });
    expect(repo.removeByEndpoint).toHaveBeenCalledWith('https://127.0.0.1/x');
  });
});

describe('which slips are worth a buzz', () => {
  it('only today’s, whether the date comes as text or as a Date', async () => {
    const push = await load();
    const today = push.todayInSA();
    const [y, m, d] = today.split('-').map(Number);
    expect(push.isForToday(today)).toBe(true);
    expect(push.isForToday(new Date(y, m - 1, d))).toBe(true);
    expect(push.isForToday('1999-01-01')).toBe(false);
  });
});
