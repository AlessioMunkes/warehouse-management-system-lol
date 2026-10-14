// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.expiring.test.js
//
// The three places a report speaks of expiring stock: the Stock expiring
// soon report, the records behind it, and the "expiring in the next two
// weeks" insight. All read the lots the stock estimate keeps (stock
// estimated left, not dismissed), so they agree with the Inventory tab
// and the daily warning. The pool is a fake database; the estimate is
// worked by hand in shelfLots.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();
const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/config/db.js', () => ({ default: pool }));

const { default: repo } = await import('../src/repositories/reporting.repository.js');
const { default: insightRepo } = await import('../src/repositories/reportingInsight.repository.js');
const { listRecords, buildRecordsSql } = await import('../src/repositories/reportingRecords.repository.js');

const line = (id, note, product, expiry, received, name) => ({
  id, delivery_note_id: note, product_id: product, expiry_date: expiry, received_quantity: String(received),
  received_on: '2026-10-01', product_name: name, sku: null,
});
const received = (note, product, quantity) => ({
  product_id: product, quantity: String(quantity), movement_type: 'received', reference_type: 'delivery_note', reference_id: note,
});

// Tuesday 13 October 2026.
//   Maize meal (1): 100 kg expiring 16 Oct, then 50 kg expiring 18 Oct; 100 kg gone, so only
//                   the 18 Oct delivery (line 2) is left.
//   Carrots (2):    20 crates expiring 25 Oct, all on the shelf, but dismissed (line 3).
//   Samp (3):       30 kg expiring 20 Nov: on the shelf, but more than 30 days off (line 4).
const LINES = [
  line(1, 10, 1, '2026-10-16', 100, 'Maize meal'), line(2, 11, 1, '2026-10-18', 50, 'Maize meal'),
  line(3, 12, 2, '2026-10-25', 20, 'Carrots'),
  line(4, 13, 3, '2026-11-20', 30, 'Samp'),
];
const MOVEMENTS = [
  received(10, 1, 100), received(11, 1, 50),
  { product_id: 1, quantity: '-100', movement_type: 'dispatched', reference_type: 'dispatch_event', reference_id: 1 },
  received(12, 2, 20), received(13, 3, 30),
];
const LEVELS = [
  { product_id: 1, quantity_on_hand: '50', unit: 'kg' },
  { product_id: 2, quantity_on_hand: '20', unit: 'crate' },
  { product_id: 3, quantity_on_hand: '30', unit: 'kg' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
  pool.query.mockImplementation(async (sql) => {
    const text = flat(sql);
    if (text.includes('FROM delivery_note_items dni JOIN delivery_notes dn')) return { rows: LINES };
    if (text.includes('FROM stock_levels WHERE')) return { rows: LEVELS };
    if (text.includes('FROM stock_movements WHERE')) return { rows: MOVEMENTS };
    if (text.includes('expiry_warning_dismissals')) {
      return { rows: [{ id: 5, delivery_note_item_id: 3, reason: 'Checked', dismissed_at: '2026-10-12', dismissed_by: 3, dismissed_by_name: 'Thandi M' }] };
    }
    return { rows: [] };
  });
});
afterEach(() => vi.useRealTimers());

const reportCalls = () => pool.query.mock.calls.filter(([sql]) => flat(sql).includes('dni.id = ANY'));

describe('the Stock expiring soon report', () => {
  it('counts only the deliveries estimated left, not dismissed, within 30 days', async () => {
    await repo.expiringStock({ dimension: 'product' });

    const [[sql, params]] = reportCalls();
    // Line 1 is used up, line 3 is dismissed, line 4 is too far off: only line 2.
    expect(params).toEqual([[2]]);
    expect(flat(sql)).toMatch(/COUNT\(\*\)::numeric AS value FROM delivery_note_items dni JOIN products p ON p\.id = dni\.product_id WHERE dni\.id = ANY\(\$1::int\[\]\)/);
    expect(flat(sql)).not.toMatch(/quantity_on_hand/);
  });

  it('asks the database nothing more when no delivery qualifies', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await repo.expiringStock({ dimension: 'week' })).toEqual([]);
    expect(reportCalls()).toHaveLength(0);
  });
});

describe('the records behind it', () => {
  it('lists just those delivery lines, ignoring the period', () => {
    const built = buildRecordsSql({ metric: 'expiring_stock', filters: {}, dateRange: { from: '2026-01-01', to: '2026-12-31' }, lineIds: [2] });

    expect(built.params).toEqual([[2]]);
    expect(flat(built.sql)).toMatch(/WHERE dni\.id = ANY\(\$1::int\[\]\)/);
    expect(flat(built.sql)).not.toMatch(/BETWEEN/);
  });

  it('numbers its own placeholder after a filter that comes with it', () => {
    const built = buildRecordsSql({ metric: 'expiring_stock', filters: { product_id: 1 }, lineIds: [2, 5] });

    expect(built.params).toEqual([[2, 5], 1]);
    expect(flat(built.sql)).toMatch(/dni\.id = ANY\(\$1::int\[\]\) AND dni\.product_id = \$2/);
  });

  it('finds the lines from the lots when the records are listed', async () => {
    await listRecords({ metric: 'expiring_stock', filters: {}, dateRange: null });

    const calls = reportCalls();
    expect(calls).toHaveLength(2);        // the rows and their count
    for (const [, params] of calls) expect(params).toEqual([[2]]);
  });

  it('leaves other reports\' records alone', () => {
    const built = buildRecordsSql({ metric: 'goods_received', filters: {}, dateRange: { from: '2026-10-01', to: '2026-10-12' } });
    expect(flat(built.sql)).not.toMatch(/ANY/);
  });
});

describe('the expiring in two weeks insight', () => {
  it('lists the deliveries estimated left, with what is left of each', async () => {
    const { rows, total } = await insightRepo.stockNearExpiry({ withinDays: 14 });

    // 18 Oct is 5 days off. 25 Oct is dismissed anyway; 16 Oct is used up.
    expect(rows).toEqual([{ name: 'Maize meal', expiry_date: '2026-10-18', quantity: 50, received: 50, unit: 'kg', days_left: 5 }]);
    expect(total).toBe(1);
  });

  it('widens with the days asked for, still leaving out the dismissed', async () => {
    const { rows } = await insightRepo.stockNearExpiry({ withinDays: 40 });

    expect(rows.map((r) => r.name)).toEqual(['Maize meal', 'Samp']);
  });
});
