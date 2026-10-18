// ─────────────────────────────────────────────────────────────
// client/src/tests/OfflineFloorWork.test.jsx
//
// The floor's work with no signal: a submission that cannot be sent is
// kept on the phone with a key the server will recognise, the screen
// says so, and a slip shows what the packer did while it waits.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiPost = vi.fn();
vi.mock('../services/api', () => ({
  apiPost: (...args) => apiPost(...args),
  apiGet: vi.fn(), apiPatch: vi.fn(), apiPut: vi.fn(), cachedGet: vi.fn(),
  newIdempotencyKey: () => 'key-0001-made-up',
  API_BASE: '',
}));
const queue = [];
vi.mock('../services/outbox', () => ({
  queueIfOffline: vi.fn(async (err, item) => {
    if (!err?.isNetworkError || !item?.body?.idempotencyKey) return false;
    queue.push(item);
    return true;
  }),
  list: vi.fn(async () => queue),
}));

const { postOrQueue } = await import('../services/offlinePost');
const picking = await import('../services/pickingAPI');
const { recordDecanting } = await import('../services/decantingAPI');
const { logRequest } = await import('../services/communityRequestAPI');
const { logCompost } = await import('../services/collectionKitAPI');

const noSignal = () => Object.assign(new Error('Could not reach the server.'), { isNetworkError: true });
const refused = () => Object.assign(new Error('Enter the bulk weight.'), { status: 400 });

beforeEach(() => { queue.length = 0; apiPost.mockReset(); });

describe('postOrQueue', () => {
  it('sends straight away when the server is there, with a key', async () => {
    apiPost.mockResolvedValue({ success: true, data: { id: 3 } });
    const res = await postOrQueue('/api/decanting', { kg: 5 }, { kind: 'decanting', label: 'A sheet' });
    expect(res).toEqual({ success: true, data: { id: 3 } });
    expect(apiPost).toHaveBeenCalledWith('/api/decanting', { kg: 5, idempotencyKey: 'key-0001-made-up' });
    expect(queue).toHaveLength(0);
  });

  it('keeps it on the phone when there is no signal, and says so', async () => {
    apiPost.mockRejectedValue(noSignal());
    const res = await postOrQueue('/api/decanting', { kg: 5 }, { kind: 'decanting', label: 'A sheet' });
    expect(res).toEqual({ queued: true, label: 'A sheet' });
    // What is queued is exactly what was tried, key included, so the
    // server sees one submission however many times it is sent.
    expect(queue).toEqual([{ endpoint: '/api/decanting', body: { kg: 5, idempotencyKey: 'key-0001-made-up' }, kind: 'decanting', label: 'A sheet', meta: undefined }]);
  });

  it('does not keep something the server refused', async () => {
    apiPost.mockRejectedValue(refused());
    await expect(postOrQueue('/api/decanting', {}, { kind: 'decanting', label: 'A sheet' })).rejects.toThrow('Enter the bulk weight.');
    expect(queue).toHaveLength(0);
  });
});

describe('packing with no signal', () => {
  it('keeps a confirmed item, a flagged one and the finished pallet', async () => {
    apiPost.mockRejectedValue(noSignal());
    expect(await picking.confirmItem(12, 101, 4, 'two bags')).toEqual({ queued: true, label: 'Pallet 12' });
    expect(await picking.flagItem(12, 102, 'Short quantity', 1)).toEqual({ queued: true, label: 'Pallet 12' });
    expect(await picking.completeSlip(12, 'A7')).toEqual({ queued: true, label: 'Pallet 12' });

    expect(queue.map((q) => [q.endpoint, q.meta.action])).toEqual([
      ['/api/picking/12/items/101/confirm', 'confirm'],
      ['/api/picking/12/items/102/flag', 'flag'],
      ['/api/picking/12/complete', 'complete'],
    ]);
  });

  it('hands back the server\'s answer when there is a signal', async () => {
    apiPost.mockResolvedValue({ success: true, data: { item: { id: 101, status: 'confirmed' } } });
    expect(await picking.confirmItem(12, 101, 4)).toEqual({ item: { id: 101, status: 'confirmed' } });
  });
});

describe('withQueuedPacking', () => {
  const slip = {
    id: 12, status: 'in_progress', pallet_ref: null,
    items: [
      { id: 101, status: 'pending', packed_quantity: null, flag_reason: null },
      { id: 102, status: 'pending', packed_quantity: null, flag_reason: null },
      { id: 103, status: 'pending', packed_quantity: null, flag_reason: null },
    ],
  };
  const waiting = (action, itemId, body) => ({ kind: 'packing', meta: { slipId: 12, itemId, action }, body });

  it('shows what the packer did while it waits to send', () => {
    const shown = picking.withQueuedPacking(slip, [
      waiting('confirm', 101, { packedQuantity: 4, note: 'two bags' }),
      waiting('flag', 102, { flagReason: 'Short quantity', packedQuantity: 1 }),
    ]);
    expect(shown.items.map((i) => [i.id, i.status, i.packed_quantity])).toEqual([
      [101, 'confirmed', 4], [102, 'flagged', 1], [103, 'pending', null],
    ]);
    expect(shown.items[1].flag_reason).toBe('Short quantity');
    expect(shown.waitingToSend).toBe(2);
    expect(shown.status).toBe('in_progress');
    // The slip that was read is not changed underneath its caller.
    expect(slip.items[0].status).toBe('pending');
  });

  it('shows a pallet logged packed as packed', () => {
    const shown = picking.withQueuedPacking(slip, [waiting('complete', undefined, { palletRef: 'A7' })]);
    expect(shown).toMatchObject({ status: 'complete', pallet_ref: 'A7', waitingToSend: 1 });
  });

  it('ignores other pallets, other kinds of work, and work the server refused for good', () => {
    const untouched = picking.withQueuedPacking(slip, [
      { kind: 'packing', meta: { slipId: 99, itemId: 101, action: 'confirm' }, body: { packedQuantity: 4 } },
      { kind: 'delivery', body: {} },
      { ...waiting('confirm', 101, { packedQuantity: 4 }), permanent: true },
    ]);
    expect(untouched).toBe(slip);
  });
});

describe('the other floor submissions', () => {
  it('keeps a decanting sheet', async () => {
    apiPost.mockRejectedValue(noSignal());
    expect(await recordDecanting({ weekOf: '2026-10-05', items: [] })).toEqual({ queued: true, label: 'A decanting sheet' });
    expect(queue[0].endpoint).toBe('/api/decanting');
  });

  it('keeps a benevolent request and a compost weigh-in for the floor', async () => {
    apiPost.mockRejectedValue(noSignal());
    expect((await logRequest({ name: 'M' }, { keepOffline: true })).queued).toBe(true);
    expect((await logCompost(4, { kgCompost: 3 }, { keepOffline: true })).queued).toBe(true);
    expect(queue.map((q) => q.endpoint)).toEqual(['/api/community-requests', '/api/collection-kits/4/records']);
  });

  // Only the floor's shell shows what is waiting and sends it.
  it('does not keep them for the manager\'s screens', async () => {
    apiPost.mockRejectedValue(noSignal());
    await expect(logRequest({ name: 'M' })).rejects.toThrow('Could not reach the server.');
    await expect(logCompost(4, { kgCompost: 3 })).rejects.toThrow('Could not reach the server.');
    expect(queue).toHaveLength(0);
  });
});
