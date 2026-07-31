// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.service.test.js
//
// Validation tests for stock.service.js. The repository is mocked —
// necessary as well as tidy, since stock.repository.js imports
// config/db.js, which calls process.exit(1) when DB_* env vars are
// missing and would kill the vitest process with no failure output.
//
// NOTE: stock.service.js throws bare `new Error(...)` with no
// `.status`, while stock.controller.js reads `err.status || 500`.
// Every validation failure below therefore surfaces to the client
// as a 500. That is covered as DEFECT G in stock.routes.test.js and
// is already flagged in the controller's own TODO.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  getManifest:  vi.fn(),
  getMovements: vi.fn(),
  manualAdjust: vi.fn(),
  adjustStock:  vi.fn(),
};

vi.mock('../src/repositories/stock.repository.js', () => ({ default: repoMock }));

const { default: stockService } = await import('../src/services/stock.service.js');

const USER_ID = 42;
const OUTCOME = { before: 100, after: 125, isShortfall: false, isUnitMismatch: false };
const VALID   = { productId: 1, quantityDelta: 25, unit: 'kg', reason: 'Recount after spillage' };

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getManifest.mockResolvedValue([]);
  repoMock.getMovements.mockResolvedValue([]);
  repoMock.manualAdjust.mockResolvedValue(OUTCOME);
});

// ── getManifest ───────────────────────────────────────────────
describe('getManifest', () => {
  it('returns the repository rows untouched', async () => {
    const rows = [{ id: 1, name: 'Rice', quantity_on_hand: 100 }];
    repoMock.getManifest.mockResolvedValueOnce(rows);

    await expect(stockService.getManifest()).resolves.toBe(rows);
  });

  it('takes no arguments — the manifest is not filtered here', async () => {
    await stockService.getManifest();
    expect(repoMock.getManifest).toHaveBeenCalledWith();
  });
});

// ── getMovements ──────────────────────────────────────────────
describe('getMovements', () => {
  it('passes the product id through', async () => {
    await stockService.getMovements(7);
    expect(repoMock.getMovements).toHaveBeenCalledWith(7);
  });

  it('requires a product id', async () => {
    await expect(stockService.getMovements(undefined)).rejects.toThrow('Product ID is required.');
    expect(repoMock.getMovements).not.toHaveBeenCalled();
  });

  it('rejects a zero id rather than querying for it', async () => {
    await expect(stockService.getMovements(0)).rejects.toThrow('Product ID is required.');
  });

  it('returns an empty history without complaint', async () => {
    await expect(stockService.getMovements(7)).resolves.toEqual([]);
  });
});

// ── adjustManually: happy path ────────────────────────────────
describe('adjustManually — accepted adjustments', () => {
  it('returns the repository outcome', async () => {
    await expect(stockService.adjustManually(VALID, USER_ID)).resolves.toBe(OUTCOME);
  });

  it('passes a fully-formed payload to the repository', async () => {
    await stockService.adjustManually(VALID, USER_ID);

    expect(repoMock.manualAdjust).toHaveBeenCalledWith({
      productId: 1, quantityDelta: 25, unit: 'kg',
      reason: 'Recount after spillage', performedBy: USER_ID,
    });
  });

  it('takes performedBy from the JWT, never from the body', async () => {
    await stockService.adjustManually({ ...VALID, performedBy: 999 }, USER_ID);
    expect(repoMock.manualAdjust).toHaveBeenCalledWith(
      expect.objectContaining({ performedBy: USER_ID })
    );
  });

  it('accepts a negative delta — stock can be written down', async () => {
    await expect(stockService.adjustManually({ ...VALID, quantityDelta: -25 }, USER_ID))
      .resolves.toBeDefined();
  });

  it('coerces a numeric string off the form', async () => {
    await stockService.adjustManually({ ...VALID, quantityDelta: '-25' }, USER_ID);
    expect(repoMock.manualAdjust).toHaveBeenCalledWith(
      expect.objectContaining({ quantityDelta: -25 })
    );
  });

  it('accepts a decimal delta', async () => {
    await stockService.adjustManually({ ...VALID, quantityDelta: 2.5 }, USER_ID);
    expect(repoMock.manualAdjust).toHaveBeenCalledWith(
      expect.objectContaining({ quantityDelta: 2.5 })
    );
  });

  it('trims the reason before storing it', async () => {
    await stockService.adjustManually({ ...VALID, reason: '   spillage   ' }, USER_ID);
    expect(repoMock.manualAdjust).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'spillage' })
    );
  });

  it('normalises a missing unit to null so the ledger\'s unit wins', async () => {
    const { unit, ...noUnit } = VALID;
    await stockService.adjustManually(noUnit, USER_ID);
    expect(repoMock.manualAdjust).toHaveBeenCalledWith(
      expect.objectContaining({ unit: null })
    );
  });

  it('passes the shortfall flag through without treating it as an error', async () => {
    repoMock.manualAdjust.mockResolvedValueOnce({ ...OUTCOME, after: -3, isShortfall: true });
    await expect(stockService.adjustManually(VALID, USER_ID))
      .resolves.toMatchObject({ isShortfall: true });
  });

  it('passes the unit-mismatch flag through as a warning, not a failure', async () => {
    repoMock.manualAdjust.mockResolvedValueOnce({ ...OUTCOME, isUnitMismatch: true });
    await expect(stockService.adjustManually(VALID, USER_ID))
      .resolves.toMatchObject({ isUnitMismatch: true });
  });
});

// ── adjustManually: rejected ──────────────────────────────────
describe('adjustManually — rejected adjustments', () => {
  const rejects = async (body, pattern) => {
    await expect(stockService.adjustManually(body, USER_ID)).rejects.toThrow(pattern);
    expect(repoMock.manualAdjust).not.toHaveBeenCalled();
  };

  it('requires a product', async () => {
    const { productId, ...noProduct } = VALID;
    await rejects(noProduct, 'Product is required.');
  });

  it('requires a quantity change', async () => {
    const { quantityDelta, ...noDelta } = VALID;
    await rejects(noDelta, /non-zero quantity change/);
  });

  it('rejects a null quantity', async () => {
    await rejects({ ...VALID, quantityDelta: null }, /non-zero quantity change/);
  });

  it('rejects a zero adjustment — a no-op is not worth an audit row', async () => {
    await rejects({ ...VALID, quantityDelta: 0 }, /non-zero quantity change/);
  });

  it('rejects a non-numeric quantity', async () => {
    await rejects({ ...VALID, quantityDelta: 'twenty' }, /non-zero quantity change/);
  });

  it('rejects Infinity', async () => {
    await rejects({ ...VALID, quantityDelta: Infinity }, /non-zero quantity change/);
  });

  it('requires a reason — BR-02, every manual change is explained', async () => {
    const { reason, ...noReason } = VALID;
    await rejects(noReason, /A reason is required/);
  });

  it('rejects a whitespace-only reason', async () => {
    await rejects({ ...VALID, reason: '     ' }, /A reason is required/);
  });

  it('rejects an empty reason', async () => {
    await rejects({ ...VALID, reason: '' }, /A reason is required/);
  });

  it('reports a product the repository could not find', async () => {
    repoMock.manualAdjust.mockResolvedValueOnce({ productNotFound: true });
    await expect(stockService.adjustManually(VALID, USER_ID)).rejects.toThrow('Product not found.');
  });
});

// ── Error contract ────────────────────────────────────────────
describe('error contract with the controller', () => {
  // stock.controller.js maps err.status, falling back to 500. Nothing
  // in stock.service.js sets .status, so this pins the current state:
  // when the fail() helper is added, these become the 400/404 checks.
  const cases = [
    ['missing product', { ...VALID, productId: undefined }],
    ['zero delta',      { ...VALID, quantityDelta: 0 }],
    ['missing reason',  { ...VALID, reason: '' }],
  ];

  it.each(cases)('%s throws without a status, so the controller sends 500', async (_l, body) => {
    try {
      await stockService.adjustManually(body, USER_ID);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBeUndefined();
    }
  });
});