// ─────────────────────────────────────────────────────────────
// server/__tests__/decanting.service.test.js
//
// Tests for the persistence-backed service methods. The repository
// is mocked, so these assert what the service hands to the DB layer
// and how it guards the inputs — not SQL behaviour.
//
// Pure calculator helpers are covered in decanting.calc.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  createDecanting:            vi.fn(),
  getDecantingRecords:        vi.fn(),
  getDecantingById:           vi.fn(),
  getWeeklyProcurementReport: vi.fn(),
};

vi.mock('../src/repositories/decanting.repository.js', () => ({ default: repoMock }));

const { default: decantingService } = await import('../src/services/decanting.service.js');

const WEEK = '2026-07-27';
const USER_ID = 42;

const validItems = [{ productId: 1, productName: 'Rice', requiredKg: 25, actualBulkKg: 24 }];

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.createDecanting.mockResolvedValue({ id: 1 });
  repoMock.getDecantingRecords.mockResolvedValue([]);
  repoMock.getDecantingById.mockResolvedValue({ id: 1, lines: [] });
  repoMock.getWeeklyProcurementReport.mockResolvedValue({});
});

// ── recordDecanting: guards ───────────────────────────────────
describe('recordDecanting — input guards', () => {
  it('requires a week', async () => {
    await expect(decantingService.recordDecanting({ items: validItems }, USER_ID))
      .rejects.toThrow('Week (weekOf) is required.');
  });

  it('requires at least one line', async () => {
    await expect(decantingService.recordDecanting({ weekOf: WEEK, items: [] }, USER_ID))
      .rejects.toThrow('At least one decanting line is required.');
  });

  it('requires an acting user', async () => {
    await expect(decantingService.recordDecanting({ weekOf: WEEK, items: validItems }, undefined))
      .rejects.toThrow('User is required.');
  });

  it('tolerates a completely absent payload', async () => {
    await expect(decantingService.recordDecanting(undefined, USER_ID)).rejects.toThrow();
  });

  it('does not touch the database when validation fails', async () => {
    await expect(decantingService.recordDecanting({ items: validItems }, USER_ID)).rejects.toThrow();
    expect(repoMock.createDecanting).not.toHaveBeenCalled();
  });
});

// ── recordDecanting: tamper resistance ────────────────────────
describe('recordDecanting — the stored plan is recalculated server-side', () => {
  it('ignores bag counts and packed weight supplied by the client', async () => {
    await decantingService.recordDecanting({
      weekOf: WEEK,
      items: [{
        productId: 1, productName: 'Rice', requiredKg: 25,
        // A tampered or stale client payload:
        packedKg: 9999, totalBags: 9999, bags: { '5kg': 9999 }, withinMargin: false,
      }],
    }, USER_ID);

    const [line] = repoMock.createDecanting.mock.calls[0][0].lines;
    expect(line.packedKg).toBe(25);
    expect(line.totalBags).toBe(5);
    expect(line.bags).toEqual({ '5kg': 5, '2.5kg': 0, '1kg': 0, '500g': 0, '250g': 0 });
    expect(line.withinMargin).toBe(true);
  });

  it('takes recordedBy from the JWT argument, never from the body', async () => {
    await decantingService.recordDecanting({
      weekOf: WEEK, recordedBy: 999, items: validItems,
    }, USER_ID);

    expect(repoMock.createDecanting).toHaveBeenCalledWith(
      expect.objectContaining({ recordedBy: USER_ID })
    );
  });

  it('passes the week and notes straight through', async () => {
    await decantingService.recordDecanting({
      weekOf: WEEK, notes: 'Rice bags light again', items: validItems,
    }, USER_ID);

    expect(repoMock.createDecanting).toHaveBeenCalledWith(
      expect.objectContaining({ weekOf: WEEK, notes: 'Rice bags light again' })
    );
  });

  it('normalises absent notes to null rather than undefined', async () => {
    await decantingService.recordDecanting({ weekOf: WEEK, items: validItems }, USER_ID);
    const payload = repoMock.createDecanting.mock.calls[0][0];
    expect(payload.notes).toBeNull();
    expect(payload.lines[0].notes).toBeNull();
  });

  it('returns whatever the repository returns', async () => {
    repoMock.createDecanting.mockResolvedValueOnce({ id: 77 });
    const result = await decantingService.recordDecanting(
      { weekOf: WEEK, items: validItems }, USER_ID
    );
    expect(result).toEqual({ id: 77 });
  });
});

// ── recordDecanting: wastage ──────────────────────────────────
describe('recordDecanting — measured wastage', () => {
  const withWastage = (wastageKg) => decantingService.recordDecanting({
    weekOf: WEEK,
    items: [{ productId: 1, productName: 'Rice', requiredKg: 25, actualBulkKg: 24, wastageKg }],
  }, USER_ID);

  it('defaults wastage to zero when the team did not record any', async () => {
    await decantingService.recordDecanting({ weekOf: WEEK, items: validItems }, USER_ID);
    expect(repoMock.createDecanting.mock.calls[0][0].lines[0].wastageKg).toBe(0);
  });

  it('stores a recorded wastage figure', async () => {
    await withWastage(0.3);
    expect(repoMock.createDecanting.mock.calls[0][0].lines[0].wastageKg).toBe(0.3);
  });

  it('accepts a numeric string off the form', async () => {
    await withWastage('0.3');
    expect(repoMock.createDecanting.mock.calls[0][0].lines[0].wastageKg).toBe(0.3);
  });

  it('rounds wastage to three decimals for the sheet', async () => {
    await withWastage(0.30049);
    expect(repoMock.createDecanting.mock.calls[0][0].lines[0].wastageKg).toBe(0.3);
  });

  it('treats an empty string as no wastage recorded', async () => {
    await withWastage('');
    expect(repoMock.createDecanting.mock.calls[0][0].lines[0].wastageKg).toBe(0);
  });

  it('rejects negative wastage', async () => {
    await expect(withWastage(-1)).rejects.toThrow(/must be zero or a positive number/);
    expect(repoMock.createDecanting).not.toHaveBeenCalled();
  });

  it('rejects non-numeric wastage', async () => {
    await expect(withWastage('lots')).rejects.toThrow(/must be zero or a positive number/);
  });
});

// ── getDecantingRecords ───────────────────────────────────────
describe('getDecantingRecords — range whitelist', () => {
  it.each(['today', 'week', 'month', 'all'])('passes the valid range "%s" through', async (range) => {
    await decantingService.getDecantingRecords(range);
    expect(repoMock.getDecantingRecords).toHaveBeenCalledWith(range);
  });

  it.each([
    ['an unknown range', 'yesterday'],
    ['an injection attempt', "all'; DROP TABLE decanting_records; --"],
    ['undefined', undefined],
    ['a number', 7],
  ])('falls back to "all" for %s', async (_label, range) => {
    await decantingService.getDecantingRecords(range);
    expect(repoMock.getDecantingRecords).toHaveBeenCalledWith('all');
  });
});

// ── getDecantingById ──────────────────────────────────────────
describe('getDecantingById', () => {
  it('requires an id', async () => {
    await expect(decantingService.getDecantingById(undefined))
      .rejects.toThrow('Decanting record ID is required.');
    expect(repoMock.getDecantingById).not.toHaveBeenCalled();
  });

  it('throws the 404-mapped message when the record is missing', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce(null);
    await expect(decantingService.getDecantingById(999))
      .rejects.toThrow('Decanting record not found.');
  });

  it('returns the record when it exists', async () => {
    const record = { id: 5, lines: [] };
    repoMock.getDecantingById.mockResolvedValueOnce(record);
    await expect(decantingService.getDecantingById(5)).resolves.toBe(record);
  });
});

// ── getWeeklyProcurementReport ────────────────────────────────
describe('getWeeklyProcurementReport', () => {
  it('requires a week', async () => {
    await expect(decantingService.getWeeklyProcurementReport(undefined))
      .rejects.toThrow('Week (weekOf) is required.');
    expect(repoMock.getWeeklyProcurementReport).not.toHaveBeenCalled();
  });

  it('passes the week through', async () => {
    await decantingService.getWeeklyProcurementReport(WEEK);
    expect(repoMock.getWeeklyProcurementReport).toHaveBeenCalledWith(WEEK);
  });
});

// ── exportDecantingSheet ──────────────────────────────────────
describe('exportDecantingSheet', () => {
  const record = {
    id: 7,
    week_of: WEEK,
    recorded_by_name: 'Mapelo',
    notes: 'Short delivery, rice',
    lines: [{
      sku: 'RICE-25', product_name: 'Rice, white',
      required_kg: 24.3, actual_bulk_kg: 24, packed_kg: 24.25,
      sizes_kg: [5, 2.5, 1, 0.5, 0.25],
      bags: { '5kg': 4, '2.5kg': 1, '1kg': 1, '500g': 1, '250g': 1 },
      total_bags: 8, margin_error: 0.0021, within_margin: true,
      wastage_kg: 0.3, surplus_kg: 0, shortfall_kg: 0.25, notes: null,
    }],
  };

  const lines = (csv) => csv.split('\r\n');

  it('names the file by week and record id', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce(record);
    const { filename } = await decantingService.exportDecantingSheet(7);
    expect(filename).toBe(`decanting-sheet-${WEEK}-7.csv`);
  });

  it('opens with the header block', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce(record);
    const { csv } = await decantingService.exportDecantingSheet(7);
    const rows = lines(csv);

    expect(rows[0]).toBe('Decanting Sheet');
    expect(rows[1]).toBe(`Week Of,${WEEK}`);
    expect(rows[2]).toBe('Recorded By,Mapelo');
    expect(rows[4]).toBe('');   // blank separator
  });

  it('quotes fields containing commas so Excel parses them', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce(record);
    const { csv } = await decantingService.exportDecantingSheet(7);

    expect(csv).toContain('"Short delivery, rice"');
    expect(csv).toContain('"Rice, white"');
  });

  it('escapes embedded double quotes by doubling them', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce({
      ...record,
      lines: [{ ...record.lines[0], product_name: 'Rice 25" bag' }],
    });
    const { csv } = await decantingService.exportDecantingSheet(7);
    expect(csv).toContain('"Rice 25"" bag"');
  });

  it('uses CRLF line endings', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce(record);
    const { csv } = await decantingService.exportDecantingSheet(7);
    expect(csv).toContain('\r\n');
  });

  it('writes one data row per line with the bag counts', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce(record);
    const { csv } = await decantingService.exportDecantingSheet(7);
    const dataRow = lines(csv)[6];

    expect(dataRow).toContain('RICE-25');
    expect(dataRow).toContain('5 / 2.5 / 1 / 0.5 / 0.25');
    expect(dataRow).toContain('Yes');          // within margin
    expect(dataRow).toContain('0.21');         // margin as a percentage
  });

  it('renders a blank cell, not "null", for a missing bulk weight', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce({
      ...record,
      lines: [{ ...record.lines[0], actual_bulk_kg: null }],
    });
    const { csv } = await decantingService.exportDecantingSheet(7);
    expect(csv).not.toContain('null');
  });

  it('propagates the not-found error so the controller can return 404', async () => {
    repoMock.getDecantingById.mockResolvedValueOnce(null);
    await expect(decantingService.exportDecantingSheet(999))
      .rejects.toThrow('Decanting record not found.');
  });
});

// ── Known defects ─────────────────────────────────────────────
describe.skip('known defects — un-skip once fixed', () => {
  it('DEFECT 3: custom bag sizes are dropped from the CSV columns', async () => {
    // The sheet hard-codes columns for 5kg/2.5kg/1kg/500g/250g. A run
    // decanted into a custom 750 g bag records total_bags: 10 while the
    // per-size columns sum to 9, so the sheet does not reconcile — and
    // procurement loses the wastage attribution for that size.
    // Fix: derive the size columns from the record's sizes_kg.
    repoMock.getDecantingById.mockResolvedValueOnce({
      id: 8, week_of: WEEK, recorded_by_name: 'Mapelo', notes: null,
      lines: [{
        sku: 'SOYA-50', product_name: 'Soya mince',
        required_kg: 10, actual_bulk_kg: null, packed_kg: 10,
        sizes_kg: [1, 0.75], bags: { '1kg': 9, '750g': 1 }, total_bags: 10,
        margin_error: 0, within_margin: true,
        wastage_kg: 0, surplus_kg: 0, shortfall_kg: 0, notes: null,
      }],
    });

    const { csv } = await decantingService.exportDecantingSheet(8);
    const header = csv.split('\r\n')[5];
    const row    = csv.split('\r\n')[6];

    expect(header).toContain('750g');
    const counts = row.split(',').slice(6, 11).map(Number);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('DEFECT 4: a product name starting with = is a formula in Excel', async () => {
    // Staff open these sheets in Excel. escapeCsvField only quotes on
    // comma/quote/newline, so a value like =1+1 is written bare and
    // Excel evaluates it. Master data is manager-controlled, so the
    // risk is low, but the fix is a one-liner: prefix a leading
    // = + - @ with a single quote.
    repoMock.getDecantingById.mockResolvedValueOnce({
      id: 9, week_of: WEEK, recorded_by_name: 'Mapelo', notes: null,
      lines: [{
        sku: '=1+1', product_name: 'Rice', required_kg: 10, actual_bulk_kg: null,
        packed_kg: 10, sizes_kg: [1], bags: { '1kg': 10 }, total_bags: 10,
        margin_error: 0, within_margin: true,
        wastage_kg: 0, surplus_kg: 0, shortfall_kg: 0, notes: null,
      }],
    });

    const { csv } = await decantingService.exportDecantingSheet(9);
    // Boundary must include the row separator, not just commas — the
    // field is the first cell of its row, so it follows a newline.
    expect(csv).not.toMatch(/(^|[,\n])=1\+1/);
  });
});