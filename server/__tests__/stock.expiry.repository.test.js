// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.expiry.repository.test.js
//
// The two expiry/recency additions the inventory tabs read: the
// manifest's last_movement_at and earliest_expiry, and the per-product
// list of deliveries behind the detail panel.
//
// The pool is mocked. The estimate of which deliveries are on the shelf
// is worked by hand in shelfLots.test.js; here the rows it is made from
// come from a fake database, and what the manifest and the panel do
// with the answer is checked. The SQL itself is run against a real
// Postgres in integration/shelfLots.integration.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/stock.repository.js');

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockResolvedValue({ rows: [] });
});

// The database as the shelf estimate sees it, from Tuesday 13 October 2026.
// Maize meal (1): two deliveries of 100 and 50 kg, 100 kg gone, 50 on hand.
// The estimate takes the 100 from the first delivery, so only the second is left.
const MAIZE_LINES = [
  { id: 1, delivery_note_id: 10, product_id: 1, expiry_date: '2026-10-20', received_quantity: '100', received_on: '2026-09-01', supplier_name: 'Cape Mills', product_name: 'Maize meal', sku: 'MM' },
  { id: 2, delivery_note_id: 11, product_id: 1, expiry_date: '2026-11-05', received_quantity: '50', received_on: '2026-10-01', supplier_name: 'Cape Mills', product_name: 'Maize meal', sku: 'MM' },
];
const received = (note, quantity) => ({ product_id: 1, quantity: String(quantity), movement_type: 'received', reference_type: 'delivery_note', reference_id: note });
const MAIZE_MOVEMENTS = [
  received(10, 100), received(11, 50),
  { product_id: 1, quantity: '-100', movement_type: 'dispatched', reference_type: 'dispatch_event', reference_id: 4 },
];

const database = ({ dismissals = [], lines = MAIZE_LINES, onHand = 50, movements = MAIZE_MOVEMENTS } = {}) => {
  poolMock.query.mockImplementation(async (sql) => {
    const text = flat(sql);
    if (text.includes('FROM products p')) return { rows: [{ id: 1, name: 'Maize meal' }, { id: 2, name: 'Salt' }] };
    if (text.includes('FROM delivery_note_items dni')) return { rows: lines };
    if (text.includes('FROM stock_levels WHERE')) return { rows: [{ product_id: 1, quantity_on_hand: String(onHand), unit: 'kg' }] };
    if (text.includes('FROM stock_movements WHERE')) return { rows: movements };
    if (text.includes('expiry_warning_dismissals')) return { rows: dismissals };
    return { rows: [] };
  });
};

const dismissal = (lineId) => ({
  id: 9, delivery_note_item_id: lineId, reason: 'Checked the shelf', dismissed_at: '2026-10-12T09:00:00Z',
  dismissed_by: 3, dismissed_by_name: 'Thandi M',
});

const atTuesday = () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
};

describe('getManifest — dates for the inventory tabs', () => {
  atTuesday();

  it('reads the last movement from stock_movements, not stock_levels.updated_at', async () => {
    await repo.getManifest();
    const sql = flat(poolMock.query.mock.calls[0][0]);

    // A threshold edit bumps updated_at without moving any stock, so
    // "No movement 60+ days" has to come from the ledger itself.
    expect(sql).toMatch(/MAX\(created_at\) AS last_movement_at FROM stock_movements/);
    expect(sql).toMatch(/lm\.last_movement_at/);
    expect(sql).toMatch(/GROUP BY product_id \) lm ON lm\.product_id = p\.id/);
  });

  it('takes the earliest expiry from the delivery estimated to be on the shelf, not the soonest date ever received', async () => {
    database();
    const rows = await repo.getManifest();

    // The 20 Oct delivery is estimated used up (the 100 kg that left came from it).
    expect(rows[0]).toMatchObject({ id: 1, earliest_expiry: '2026-11-05', earliest_expiry_left: 50 });
    expect(rows[1]).toMatchObject({ id: 2, earliest_expiry: null, earliest_expiry_left: null });
  });

  it('skips a delivery whose warning a manager has dismissed', async () => {
    // Both deliveries are on the shelf, but the sooner one is dismissed.
    database({ onHand: 150, movements: [received(10, 100), received(11, 50)], dismissals: [dismissal(1)] });
    const rows = await repo.getManifest();

    expect(rows[0].earliest_expiry).toBe('2026-11-05');
  });

  it('leaves out a date that has passed', async () => {
    database({
      lines: [{ ...MAIZE_LINES[0], expiry_date: '2026-10-12' }],
      onHand: 100,
      movements: [received(10, 100)],
    });
    expect((await repo.getManifest())[0].earliest_expiry).toBeNull();
  });
});

describe('getExpiryBatches', () => {
  atTuesday();

  it('lists the deliveries estimated to be on the shelf, with how much is left of each', async () => {
    database();
    const rows = await repo.getExpiryBatches('1');

    expect(rows).toEqual([{
      id: 2, expiry_date: '2026-11-05', received_quantity: 50, quantity_left: 50, unit: 'kg',
      received_on: '2026-10-01', supplier_name: 'Cape Mills', days_left: 23, estimated: true, dismissal: null,
    }]);
  });

  it('shows a dismissed delivery with who dismissed it and why', async () => {
    database({ dismissals: [dismissal(2)] });
    const [row] = await repo.getExpiryBatches(1);

    expect(row.dismissal).toEqual({ id: 9, by_name: 'Thandi M', at: '2026-10-12T09:00:00Z', reason: 'Checked the shelf' });
  });

  it('keeps recently expired deliveries but drops ones past the grace window', async () => {
    database({
      lines: [
        { ...MAIZE_LINES[0], expiry_date: '2026-09-01', received_quantity: '10' },
        { ...MAIZE_LINES[1], expiry_date: '2026-10-08', received_quantity: '10' },
      ],
      onHand: 20,
      movements: [received(10, 10), received(11, 10)],
    });
    const rows = await repo.getExpiryBatches(1);

    // 1 Sep is 42 days ago: dropped. 8 Oct is 5 days ago: kept.
    expect(rows.map((r) => [r.id, r.days_left])).toEqual([[2, -5]]);
  });

  it('asks only for the one product', async () => {
    database();
    await repo.getExpiryBatches(7);
    const [, params] = poolMock.query.mock.calls[0];
    expect(params).toEqual([[7]]);
  });

  it('has nothing to say for a product with no dated deliveries', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    expect(await repo.getExpiryBatches(7)).toEqual([]);
  });
});

describe('getLedger — references a manager can open', () => {
  it('follows a dispatch movement to its picking slip and a receipt to its purchase order', async () => {
    await repo.getLedger({ limit: 10 });
    const sql = flat(poolMock.query.mock.calls[0][0]);

    expect(sql).toMatch(/LEFT JOIN dispatch_events de ON w\.reference_type = 'dispatch_event' AND de\.id = w\.reference_id/);
    expect(sql).toMatch(/LEFT JOIN delivery_notes dn ON w\.reference_type = 'delivery_note' AND dn\.id = w\.reference_id/);
    expect(sql).toMatch(/de\.picking_slip_id AS picking_slip_id/);
    expect(sql).toMatch(/po\.po_number AS po_number/);
  });
});
