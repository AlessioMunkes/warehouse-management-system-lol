// ─────────────────────────────────────────────────────────────
// server/__tests__/collectionKit.idle.test.js
//
// A collection kit given out months ago with no compost ever logged is
// sent to the managers' bell so someone follows up with its owner.
// Once per kit: the notice is written with avoidDuplicate.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const kitRepo = vi.hoisted(() => ({ listIdleKits: vi.fn() }));
const notify = vi.hoisted(() => ({ createNotification: vi.fn() }));
vi.mock('../src/repositories/collectionKit.repository.js', () => ({ default: kitRepo, IDLE_KIT_MONTHS: 3 }));
vi.mock('../src/repositories/notification.repository.js', () => notify);

const { default: pool } = await import('../src/config/db.js');
const { default: kits, IDLE_KIT_MONTHS } = await import('../src/services/collectionKit.service.js');

const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  pool.connect.mockResolvedValue(client);
});

describe('runIdleKitCheck', () => {
  it('asks for kits idle for three months and sends each to the managers once', async () => {
    kitRepo.listIdleKits.mockResolvedValue([
      { id: 19, owner_name: 'Nomsa Dlamini', suburb: 'Langa', assigned_at: '2026-06-01' },
    ]);

    const summary = await kits.runIdleKitCheck();

    expect(IDLE_KIT_MONTHS).toBe(3);
    expect(kitRepo.listIdleKits).toHaveBeenCalledWith({ months: 3 });
    expect(notify.createNotification).toHaveBeenCalledWith(client, expect.objectContaining({
      type: 'collection_kit_idle',
      title: 'CK0019 has no compost logged',
      entityType: 'collection_kit',
      entityId: 19,
      avoidDuplicate: true,
    }));
    expect(notify.createNotification.mock.calls[0][1].body).toMatch(/Nomsa Dlamini, Langa .* Follow up with the owner\./);
    expect(summary).toEqual({ checked: 1, notified: 1 });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does nothing when no kit is idle', async () => {
    kitRepo.listIdleKits.mockResolvedValue([]);
    expect(await kits.runIdleKitCheck()).toEqual({ checked: 0, notified: 0 });
    expect(notify.createNotification).not.toHaveBeenCalled();
  });

  it('is quiet in a warehouse that has no kit tables', async () => {
    kitRepo.listIdleKits.mockRejectedValue(Object.assign(new Error('no table'), { code: '42P01' }));
    expect(await kits.runIdleKitCheck()).toEqual({ checked: 0, notified: 0 });
  });

  it('carries on to the next kit when one notice fails', async () => {
    kitRepo.listIdleKits.mockResolvedValue([
      { id: 1, owner_name: 'A', suburb: null, assigned_at: '2026-01-01' },
      { id: 2, owner_name: 'B', suburb: null, assigned_at: '2026-01-02' },
    ]);
    notify.createNotification.mockRejectedValueOnce(new Error('boom'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await kits.runIdleKitCheck()).toEqual({ checked: 2, notified: 1 });
    quiet.mockRestore();
  });
});
