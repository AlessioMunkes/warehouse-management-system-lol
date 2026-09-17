// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.ledger.test.js
//
// The service layer of the stock ledger: filter parsing, cursor
// round-tripping, and the shape handed to the repository.
//
// The repository is mocked, so this does not prove the SQL — that was
// verified against a real Postgres 16 instance, which is the only
// thing that can prove a window function or a keyset comparison. What
// this locks down is everything between the query string and the
// repository call, which is where the parsing bugs live.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  getLedger:         vi.fn(),
  getLedgerSummary:  vi.fn(),
  getReconciliation: vi.fn(),
  getLedgerActors:   vi.fn(),
  getManifest:       vi.fn(),
  getMovements:      vi.fn(),
  manualAdjust:      vi.fn(),
};

vi.mock('../src/repositories/stock.repository.js', () => ({ default: repoMock }));

const { default: stockService } = await import('../src/services/stock.service.js');

const EMPTY_SUMMARY = {
  total_in: '0', total_out: '0', net_change: '0',
  movement_count: 0, product_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getLedger.mockResolvedValue({ rows: [], nextCursor: null });
  repoMock.getLedgerSummary.mockResolvedValue(EMPTY_SUMMARY);
});

describe('stockService.getLedger — filters', () => {
  it('defaults to a 50-row page with no filters', async () => {
    await stockService.getLedger({});
    const args = repoMock.getLedger.mock.calls[0][0];
    expect(args.limit).toBe(50);
    expect(args.cursor).toBeNull();
    expect(args.movementTypes).toEqual([]);
  });

  it('accepts movement types as a comma-separated string', async () => {
    await stockService.getLedger({ movementType: 'wastage,received' });
    expect(repoMock.getLedger.mock.calls[0][0].movementTypes).toEqual(['wastage', 'received']);
  });

  it('accepts movement types as a repeated query parameter', async () => {
    await stockService.getLedger({ movementType: ['wastage', 'dispatched'] });
    expect(repoMock.getLedger.mock.calls[0][0].movementTypes).toEqual(['wastage', 'dispatched']);
  });

  it('rejects a movement type that is not in the constraint', async () => {
    await expect(stockService.getLedger({ movementType: 'stolen' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a date that is not a calendar date', async () => {
    await expect(stockService.getLedger({ from: '09/09/2026' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('passes calendar dates through unparsed, so no timezone shift can occur', async () => {
    await stockService.getLedger({ from: '2026-09-01', to: '2026-09-09' });
    const args = repoMock.getLedger.mock.calls[0][0];
    expect(args.from).toBe('2026-09-01');
    expect(args.to).toBe('2026-09-09');
  });

  it('rejects a start date after the end date', async () => {
    await expect(stockService.getLedger({ from: '2026-09-09', to: '2026-09-01' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a limit above the maximum', async () => {
    await expect(stockService.getLedger({ limit: '5000' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a non-integer product id', async () => {
    await expect(stockService.getLedger({ productId: 'rice' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('never sends the cursor or limit to the summary query', async () => {
    await stockService.getLedger({ limit: '10', movementType: 'wastage' });
    const summaryArgs = repoMock.getLedgerSummary.mock.calls[0][0];
    expect(summaryArgs).not.toHaveProperty('cursor');
    expect(summaryArgs).not.toHaveProperty('limit');
    expect(summaryArgs.movementTypes).toEqual(['wastage']);
  });
});

describe('stockService.getLedger — cursor', () => {
  it('round-trips a cursor back to the keyset it encodes', async () => {
    const createdAt = '2026-09-07T07:00:00.000Z';
    repoMock.getLedger.mockResolvedValue({
      rows: [], nextCursor: { createdAt, id: 42 },
    });

    const first = await stockService.getLedger({});
    expect(first.nextCursor).toBeTypeOf('string');

    await stockService.getLedger({ cursor: first.nextCursor });
    expect(repoMock.getLedger.mock.calls[1][0].cursor).toEqual({ createdAt, id: 42 });
  });

  it('returns a null cursor when there is no further page', async () => {
    const res = await stockService.getLedger({});
    expect(res.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor rather than paging from the start', async () => {
    const bad = Buffer.from('not-a-date|nope', 'utf8').toString('base64');
    await expect(stockService.getLedger({ cursor: bad }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('stockService.getReconciliation', () => {
  it('splits out the products that do not balance', async () => {
    repoMock.getReconciliation.mockResolvedValue([
      { id: 1, name: 'Rice',     variance: '0'  },
      { id: 2, name: 'Pilchards', variance: '40' },
      { id: 3, name: 'Maize',    variance: '0'  },
    ]);

    const res = await stockService.getReconciliation();
    expect(res.products).toHaveLength(3);
    expect(res.variances).toHaveLength(1);
    expect(res.variances[0].name).toBe('Pilchards');
  });

  it('reports no variances when every balance matches', async () => {
    repoMock.getReconciliation.mockResolvedValue([
      { id: 1, name: 'Rice', variance: '0' },
    ]);
    const res = await stockService.getReconciliation();
    expect(res.variances).toEqual([]);
  });

  it('treats a numeric-string zero as balanced, not as truthy', async () => {
    // node-postgres returns NUMERIC as a string: '0' is truthy in JS,
    // so a filter written as `r.variance` rather than
    // `Number(r.variance) !== 0` would report every product as broken.
    repoMock.getReconciliation.mockResolvedValue([
      { id: 1, name: 'Rice',  variance: '0.000' },
      { id: 2, name: 'Maize', variance: '-0'    },
    ]);
    const res = await stockService.getReconciliation();
    expect(res.variances).toEqual([]);
  });
});
