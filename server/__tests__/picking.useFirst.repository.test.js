// ─────────────────────────────────────────────────────────────
// server/__tests__/picking.useFirst.repository.test.js
//
// The date a packer is told to look for first (use_first_date on each
// slip line): the soonest use-by date among the deliveries estimated to
// be still on the shelf, leaving out any a manager has dismissed. The
// pool is a fake database.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();
const poolMock = { query: vi.fn(), connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/picking.repository.js');

const line = (id, note, product, expiry, received) => ({
  id, delivery_note_id: note, product_id: product, expiry_date: expiry, received_quantity: String(received),
  received_on: '2026-10-01', product_name: `Product ${product}`, sku: null,
});
const received = (note, product, quantity) => ({
  product_id: product, quantity: String(quantity), movement_type: 'received', reference_type: 'delivery_note', reference_id: note,
});

// Product 1 (Cabbage): 10 crates expiring 15 Oct, 10 expiring 22 Oct, 10 crates gone: the
// first delivery is used up, so 22 Oct is the date to look for.
// Product 2 (Carrots): two deliveries both on the shelf; the sooner is dismissed.
// Product 3 (Samp): no expiry on record.
const database = () => {
  poolMock.query.mockImplementation(async (sql) => {
    const text = flat(sql);
    if (text.includes('FROM picking_slips ps')) return { rows: [{ id: 4, ecd_name: 'Centre A' }] };
    if (text.includes('FROM picking_slip_items psi')) {
      return { rows: [{ id: 1, product_id: 1 }, { id: 2, product_id: 2 }, { id: 3, product_id: 3 }] };
    }
    if (text.includes('FROM delivery_note_items dni')) {
      return { rows: [
        line(1, 10, 1, '2026-10-15', 10), line(2, 11, 1, '2026-10-22', 10),
        line(3, 12, 2, '2026-10-16', 5), line(4, 13, 2, '2026-10-30', 5),
      ] };
    }
    if (text.includes('FROM stock_levels WHERE')) {
      return { rows: [{ product_id: 1, quantity_on_hand: '10', unit: 'crate' }, { product_id: 2, quantity_on_hand: '10', unit: 'crate' }] };
    }
    if (text.includes('FROM stock_movements WHERE')) {
      return { rows: [
        received(10, 1, 10), received(11, 1, 10),
        { product_id: 1, quantity: '-10', movement_type: 'dispatched', reference_type: 'dispatch_event', reference_id: 1 },
        received(12, 2, 5), received(13, 2, 5),
      ] };
    }
    if (text.includes('expiry_warning_dismissals')) {
      return { rows: [{ id: 5, delivery_note_item_id: 3, reason: 'Checked', dismissed_at: '2026-10-12', dismissed_by: 3, dismissed_by_name: 'Thandi M' }] };
    }
    return { rows: [] };
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('getSlipById — the date to use first', () => {
  it('gives each line the soonest date still on the shelf, not the soonest date ever received', async () => {
    database();
    const slip = await repo.getSlipById(4);

    expect(slip.items.map((i) => [i.product_id, i.use_first_date])).toEqual([
      [1, '2026-10-22'],   // the 15 Oct delivery is estimated used up
      [2, '2026-10-30'],   // the 16 Oct delivery is dismissed
      [3, null],           // no expiry on record
    ]);
  });

  it('no longer reads the dates straight off delivery_note_items for each line', async () => {
    database();
    await repo.getSlipById(4);
    const itemsSql = flat(poolMock.query.mock.calls.map(([s]) => s).find((s) => flat(s).includes('FROM picking_slip_items psi')));

    expect(itemsSql).not.toMatch(/delivery_note_items/);
    expect(itemsSql).not.toMatch(/use_first_date/);
  });

  it('returns nothing for a slip that does not exist, without loading any lots', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });

    expect(await repo.getSlipById(99)).toBeNull();
    expect(poolMock.query).toHaveBeenCalledTimes(2);
  });
});
