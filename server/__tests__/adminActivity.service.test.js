// ─────────────────────────────────────────────────────────────
// server/__tests__/adminActivity.service.test.js
//
// The admin Activity and Archive screens: every row is put in words,
// filters are checked before any query runs, and Restore is only
// offered where the item's own status route would accept it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = { listActivity: vi.fn(async () => []), listArchived: vi.fn(async () => []) };
vi.mock('../src/repositories/adminActivity.repository.js', () => ({ default: repoMock }));

const { default: service, describe: sentence } = await import('../src/services/adminActivity.service.js');

beforeEach(() => vi.clearAllMocks());

describe('each entry in words', () => {
  it('words the common actions plainly', () => {
    expect(sentence({ source: 'picking', verb: 'item_confirmed', subject: 'Little Stars ECD' }))
      .toEqual({ area: 'Packing', text: "confirmed an item on Little Stars ECD's pallet" });
    expect(sentence({ source: 'stock', verb: 'adjustment', subject: 'Maize meal', detail: { quantity: '-3', unit: 'kg', reason: 'Damaged' } }).text)
      .toBe('adjusted stock: Maize meal -3 kg (Damaged)');
    expect(sentence({ source: 'purchasing', verb: 'created', subject: 'PO-0042' }).text).toBe('raised purchase order PO-0042');
    expect(sentence({ source: 'audit', verb: 'CHECK_IN', subject: 'attendance' }))
      .toEqual({ area: 'Volunteers', text: 'checked a volunteer in' });
  });

  it('never drops an action it has no phrase for', () => {
    expect(sentence({ source: 'picking', verb: 'something_new', subject: 'X' }).text).toBe('something new: X');
    expect(sentence({ source: 'audit', verb: 'MERGED', subject: 'widget' }).text).toBe('merged (widget)');
  });
});

describe('the activity filters', () => {
  it('defaults to the last 30 days and passes the person through', async () => {
    const res = await service.listActivity({ user: '7' });
    const call = repoMock.listActivity.mock.calls[0][0];
    expect(call.actorId).toBe(7);
    expect((Date.parse(call.to) - Date.parse(call.from)) / 86400000).toBe(29);
    expect(res).toMatchObject({ entries: [], people: [] });
  });

  it('refuses bad dates, a reversed range, over a year, and a bad person', async () => {
    await expect(service.listActivity({ from: '1 Sept' })).rejects.toMatchObject({ status: 400 });
    await expect(service.listActivity({ from: '2026-09-10', to: '2026-09-01' })).rejects.toMatchObject({ status: 400 });
    await expect(service.listActivity({ from: '2024-01-01', to: '2026-01-01' })).rejects.toMatchObject({ status: 400 });
    await expect(service.listActivity({ user: 'drop table' })).rejects.toMatchObject({ status: 400 });
    expect(repoMock.listActivity).not.toHaveBeenCalled();
  });

  it('counts who was busiest, the system included', async () => {
    repoMock.listActivity.mockResolvedValueOnce([
      { source: 'picking', verb: 'completed', subject: 'A', at: '2026-09-02T08:00:00Z', actor_id: 3, actor_name: 'Mcebisi', username: 'w1', actor_role: 'warehouse_worker', screen: 'pickingSlips', record_id: '9' },
      { source: 'picking', verb: 'completed', subject: 'B', at: '2026-09-01T08:00:00Z', actor_id: 3, actor_name: 'Mcebisi', username: 'w1', actor_role: 'warehouse_worker' },
      { source: 'picking', verb: 'not_collected', subject: 'C', at: '2026-09-01T09:00:00Z', actor_id: null },
    ]);
    const res = await service.listActivity({ from: '2026-09-01', to: '2026-09-02' });
    expect(res.people.map((p) => [p.name, p.count])).toEqual([['Mcebisi', 2], ['System', 1]]);
    expect(res.entries[0].link).toEqual({ screen: 'pickingSlips', id: '9' });
    expect(res.entries[2].actor).toBeNull();
  });
});

describe('the archive', () => {
  it('offers Restore only for deactivated items that have a status route', async () => {
    repoMock.listArchived.mockResolvedValueOnce([
      { kind: 'user', id: '4', name: 'Old account', state: 'deactivated' },
      { kind: 'user', id: '5', name: 'Deleted account', state: 'deleted' },
      { kind: 'beneficiary', id: '9', name: 'Closed ECD', state: 'deactivated' },
      { kind: 'programme', id: '2', name: 'Old programme', state: 'deactivated' },
    ]);
    const items = await service.listArchived();
    expect(items.map((x) => [x.name, x.restorable])).toEqual([
      ['Old account', true], ['Deleted account', false], ['Closed ECD', true], ['Old programme', false],
    ]);
    expect(items[2].kindLabel).toBe('ECD centre');
  });
});
