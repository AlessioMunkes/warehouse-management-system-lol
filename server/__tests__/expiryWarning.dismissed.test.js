// ─────────────────────────────────────────────────────────────
// server/__tests__/expiryWarning.dismissed.test.js
//
// The daily sweep end to end on a fake database (service, job
// repository and the shared lots loader are all real): it warns about a
// delivery estimated to have stock left, not about one estimated used
// up, and never about one a manager has dismissed.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();
const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
const poolMock = { query: vi.fn(), connect: vi.fn(async () => client) };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const createNotificationMock = vi.fn();
vi.mock('../src/repositories/notification.repository.js', () => ({
  createNotification: (...args) => createNotificationMock(...args),
}));

const { default: sweep } = await import('../src/services/expiryWarning.service.js');

// Tuesday 13 October 2026. Maize meal: 100 kg (expires 16 Oct) then 50 kg
// (expires 18 Oct) received; 100 kg has gone out, which the estimate takes
// from the first delivery. Only the second is still on the shelf.
const LINES = [
  { id: 1, delivery_note_id: 10, product_id: 1, expiry_date: '2026-10-16', received_quantity: '100', received_on: '2026-10-01', product_name: 'Maize meal', sku: 'MM-01' },
  { id: 2, delivery_note_id: 11, product_id: 1, expiry_date: '2026-10-18', received_quantity: '50', received_on: '2026-10-05', product_name: 'Maize meal', sku: 'MM-01' },
];
const MOVEMENTS = [
  { product_id: 1, quantity: '100', movement_type: 'received', reference_type: 'delivery_note', reference_id: 10 },
  { product_id: 1, quantity: '50', movement_type: 'received', reference_type: 'delivery_note', reference_id: 11 },
  { product_id: 1, quantity: '-100', movement_type: 'dispatched', reference_type: 'dispatch_event', reference_id: 3 },
];

const database = ({ dismissed = [], alreadySent = false } = {}) => {
  poolMock.query.mockImplementation(async (sql) => {
    const text = flat(sql);
    if (text.includes('FROM delivery_note_items dni')) return { rows: LINES };
    if (text.includes('FROM stock_levels WHERE')) return { rows: [{ product_id: 1, quantity_on_hand: '50', unit: 'kg' }] };
    if (text.includes('FROM stock_movements WHERE')) return { rows: MOVEMENTS };
    if (text.includes('expiry_warning_dismissals')) {
      return { rows: dismissed.map((id) => ({ id: 70 + id, delivery_note_item_id: id, reason: 'Checked', dismissed_at: '2026-10-12', dismissed_by: 3, dismissed_by_name: 'Thandi M' })) };
    }
    if (text.includes('FROM notifications')) return { rows: alreadySent ? [{ x: 1 }] : [] };
    return { rows: [] };
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('the expiry warning sweep', () => {
  it('warns about the delivery with stock left, at both tiers, and not about the one used up', async () => {
    database();

    const summary = await sweep.runExpiryCheck();

    // Line 2 is 5 days away: inside the 14-day and the 7-day windows. Line 1 (3 days) has no stock left.
    expect(summary).toEqual({ checked: 2, notified: 2 });
    const sent = createNotificationMock.mock.calls.map(([, n]) => [n.type, n.entityId]);
    expect(sent).toEqual([['stock_expiry_warning_2w', 2], ['stock_expiry_warning_1w', 2]]);
    expect(createNotificationMock.mock.calls[0][1].body).toMatch(/^About 50 of 50 kg left, estimated/);
  });

  it('sends nothing for a delivery a manager has dismissed', async () => {
    database({ dismissed: [2] });

    const summary = await sweep.runExpiryCheck();

    expect(summary).toEqual({ checked: 0, notified: 0 });
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('does not send a warning twice, dismissal or not', async () => {
    database({ alreadySent: true });

    expect(await sweep.runExpiryCheck()).toEqual({ checked: 2, notified: 0 });
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});
