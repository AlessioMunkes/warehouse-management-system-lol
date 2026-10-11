// ─────────────────────────────────────────────────────────────
// server/__tests__/dispatchDayComplete.test.js
//
// The notice managers get when the last pallet booked for a day has
// gone. One per day, keyed on the date, so it is written once however
// the last collection is retried.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const notify = vi.hoisted(() => ({ createNotification: vi.fn() }));
vi.mock('../src/repositories/notification.repository.js', () => notify);

const { dispatchDayComplete } = await import('../src/features/communications/notices.js');
const client = {};

beforeEach(() => vi.clearAllMocks());

describe('dispatchDayComplete', () => {
  it('says which day is done and how many pallets went', async () => {
    await dispatchDayComplete(client, { dispatchDate: '2026-10-13', pallets: 27, late: 0 });
    expect(notify.createNotification).toHaveBeenCalledWith(client, expect.objectContaining({
      type: 'dispatch_day_complete',
      title: 'Dispatch complete for Tuesday, 13 October',
      body: 'All 27 pallets collected.',
      entityType: 'dispatch_day',
      entityId: 20261013,
      avoidDuplicate: true,
    }));
  });

  it('says so when some went late, and writes single-digit days plainly', async () => {
    await dispatchDayComplete(client, { dispatchDate: '2027-01-05', pallets: 1, late: 1 });
    const sent = notify.createNotification.mock.calls[0][1];
    expect(sent.title).toBe('Dispatch complete for Tuesday, 5 January');
    expect(sent.body).toBe('All 1 pallet collected, 1 of them late.');
  });

  it('keeps a two-digit day whole', async () => {
    await dispatchDayComplete(client, { dispatchDate: '2026-10-10', pallets: 3 });
    expect(notify.createNotification.mock.calls[0][1].title).toBe('Dispatch complete for Saturday, 10 October');
  });

  it('writes nothing for a day with no pallets', async () => {
    await dispatchDayComplete(client, { dispatchDate: '2026-10-13', pallets: 0 });
    expect(notify.createNotification).not.toHaveBeenCalled();
  });
});
