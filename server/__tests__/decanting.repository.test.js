import { beforeEach, describe, expect, it, vi } from 'vitest';

const clientMock = {
  query: vi.fn(),
  release: vi.fn(),
};

const poolMock = {
  connect: vi.fn(),
  query: vi.fn(),
};

const stockMock = {
  adjustStock: vi.fn(),
};

vi.mock('../src/config/db.js', () => ({ default: poolMock }));
vi.mock('../src/repositories/stock.repository.js', () => ({ default: stockMock }));

const { default: repository } = await import('../src/repositories/decanting.repository.js');

const headerRow = {
  id: 77,
  week_of: '2026-07-27',
  notes: null,
  created_at: '2026-07-27T08:00:00.000Z',
  recorded_by_name: 'Mapelo',
};

const lineRow = (overrides = {}) => ({
  id: 1,
  product_id: 10,
  required_kg: '7.520',
  actual_bulk_kg: '7.520',
  packed_kg: '7.520',
  total_bags: 4,
  sizes_kg: [5, 2, 0.5],
  bags: { '5kg': 1, '2kg': 1, '500g': 1 },
  margin_error: '0.0000',
  within_margin: true,
  wastage_kg: '0.000',
  surplus_kg: '0.000',
  shortfall_kg: '0.000',
  partial_bag_actual_kg: '0.020',
  notes: null,
  product_name: 'Rice',
  sku: 'RICE',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  clientMock.query.mockReset();
  clientMock.release.mockReset();
  poolMock.query.mockReset();
  poolMock.connect.mockResolvedValue(clientMock);
  poolMock.query
    .mockResolvedValueOnce({ rows: [headerRow] })
    .mockResolvedValueOnce({ rows: [lineRow()] });
  clientMock.query.mockImplementation(async (sql) => {
    if (/INSERT INTO decanting_records/i.test(sql)) return { rows: [{ id: 77 }] };
    return { rows: [] };
  });
});

const insertedLineCall = () =>
  clientMock.query.mock.calls.find(([sql]) => /INSERT INTO decanting_lines/i.test(sql));

describe('decanting repository partial bag persistence', () => {
  it('saves null partial_bag_actual_kg when the calculated plan has no partial bag', async () => {
    await repository.createDecanting({
      weekOf: '2026-07-27',
      notes: null,
      recordedBy: 42,
      lines: [{
        productId: 10,
        requiredKg: 7.5,
        actualBulkKg: 7.5,
        packedKg: 7.5,
        totalBags: 3,
        sizesKg: [5, 2, 0.5],
        bags: { '5kg': 1, '2kg': 1, '500g': 1 },
        marginError: 0,
        withinMargin: true,
        wastageKg: 0,
        surplusKg: 0,
        shortfallKg: 0,
        partialBag: null,
      }],
    });

    const [, params] = insertedLineCall();
    expect(params[13]).toBeNull();
  });

  it('saves the calculated partial bag actual weight separately from full-bag counts', async () => {
    await repository.createDecanting({
      weekOf: '2026-07-27',
      notes: null,
      recordedBy: 42,
      lines: [{
        productId: 10,
        requiredKg: 7.52,
        actualBulkKg: 7.52,
        packedKg: 7.52,
        totalBags: 4,
        sizesKg: [5, 2, 0.5],
        bags: { '5kg': 1, '2kg': 1, '500g': 1 },
        marginError: 0,
        withinMargin: true,
        wastageKg: 0,
        surplusKg: 0,
        shortfallKg: 0,
        partialBag: { nominalSizeKg: 0.5, actualWeightKg: 0.02, isPartial: true },
      }],
    });

    const [, params] = insertedLineCall();
    expect(JSON.parse(params[7])).toEqual({ '5kg': 1, '2kg': 1, '500g': 1 });
    expect(params[5]).toBe(4);
    expect(params[4]).toBe(7.52);
    expect(params[13]).toBe(0.02);
  });

  it('reconstructs partialBag when reading a saved row with partial_bag_actual_kg', async () => {
    const record = await repository.getDecantingById(77);

    expect(record.lines[0].partialBag).toEqual({
      nominalSizeKg: 0.5,
      actualWeightKg: 0.02,
      isPartial: true,
    });
    expect(record.lines[0].total_bags).toBe(4);
    expect(record.lines[0].packed_kg).toBe('7.520');
  });

  it('deserializes historical rows with null partial_bag_actual_kg as no partial bag', async () => {
    poolMock.query.mockReset();
    poolMock.query
      .mockResolvedValueOnce({ rows: [headerRow] })
      .mockResolvedValueOnce({ rows: [lineRow({ partial_bag_actual_kg: null })] });

    const record = await repository.getDecantingById(77);

    expect(record.lines[0].partialBag).toBeNull();
  });

  it.each([
    ['zero', 0],
    ['negative', -0.01],
    ['500g exact', 0.5],
    ['larger than 500g', 0.51],
  ])('rejects invalid partial bag actual weight: %s', async (_label, actualWeightKg) => {
    await expect(repository.createDecanting({
      weekOf: '2026-07-27',
      notes: null,
      recordedBy: 42,
      lines: [{
        productId: 10,
        requiredKg: 7.52,
        actualBulkKg: 7.52,
        packedKg: 7.52,
        totalBags: 4,
        sizesKg: [5, 2, 0.5],
        bags: { '5kg': 1, '2kg': 1, '500g': 1 },
        marginError: 0,
        withinMargin: true,
        wastageKg: 0,
        surplusKg: 0,
        shortfallKg: 0,
        partialBag: { nominalSizeKg: 0.5, actualWeightKg, isPartial: true },
      }],
    })).rejects.toThrow('Partial bag actual weight must be greater than 0 kg and less than 0.5 kg.');
  });
});
