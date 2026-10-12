// ─────────────────────────────────────────────────────────────
// src/tests/ExcelExport.test.js
//
// The Excel export, checked on the file it really writes: the workbook
// is produced, read back, and its cells inspected. A date has to be a
// date and an amount a number, or the sheet cannot be sorted or summed,
// which is the whole reason it is not a CSV.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { exportExcel, sheetModel } from '../lib/excelExport';

const COLUMNS = [
  { key: 'delivered', label: 'Delivered', kind: 'date' },
  { key: 'supplier', label: 'Supplier', kind: 'text' },
  { key: 'received', label: 'Received', kind: 'number' },
  { key: 'value', label: 'Value', kind: 'money' },
];
const ROWS = [
  { delivered: '2026-10-10', supplier: 'Cape Dry Goods', received: 12.5, value: 600 },
  { delivered: '2026-10-11', supplier: 'Fresh Valley Farms', received: 4, value: 1250.5 },
  { delivered: '2026-10-12', supplier: 'Boland Pulses', received: null, value: null },
];

afterEach(() => vi.restoreAllMocks());

// Run the export and hand back the workbook it would have downloaded.
const written = async (args) => {
  let blob = null;
  let name = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b; return 'blob:test'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { name = this.download; });
  await exportExcel(args);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return { workbook, sheet: workbook.worksheets[0], name, type: blob.type };
};

describe('the sheet, before it is written', () => {
  it('works out what a column holds when it does not say', () => {
    const model = sheetModel({
      columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }, { key: 'd', label: 'D' }],
      rows: [{ a: 1, b: '2026-10-10', c: 'x', d: '2026-10-10 14:30' }, { a: 2.5, b: '2026-10-11', c: 3, d: null }],
    });
    expect(model.columns.map((c) => c.kind)).toEqual(['number', 'date', 'text', 'datetime']);
  });

  it('totals money and nothing else', () => {
    const model = sheetModel({ columns: COLUMNS, rows: ROWS });
    expect(model.columns.map((c) => c.total)).toEqual([null, null, null, 1850.5]);
    expect(model.hasTotals).toBe(true);
  });

  it('sizes a column to what is in it, within limits', () => {
    const model = sheetModel({
      columns: [{ key: 'short', label: 'No' }, { key: 'long', label: 'Notes' }],
      rows: [{ short: 'a', long: 'x'.repeat(200) }],
    });
    expect(model.columns[0].width).toBe(9);
    expect(model.columns[1].width).toBe(50);
  });
});

describe('the file', () => {
  it('is a real Excel workbook with a tidy name', async () => {
    const { name, type, sheet } = await written({ filename: 'goods/received.csv', title: 'Goods received', columns: COLUMNS, rows: ROWS });
    expect(name).toBe('goods-received.xlsx');
    expect(type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(sheet.name).toBe('Goods received');
  });

  it('opens with a title and what it covers', async () => {
    const { sheet } = await written({ filename: 'x', title: 'Goods received: the delivery lines', subtitle: '2026-10-01 to 2026-10-12', columns: COLUMNS, rows: ROWS });
    expect(sheet.getCell('A1').value).toBe('Goods received: the delivery lines');
    expect(sheet.getCell('A1').font.bold).toBe(true);
    expect(String(sheet.getCell('A2').value)).toMatch(/^2026-10-01 to 2026-10-12 {2}· {2}Exported /);
  });

  it('has a bold filled header that stays put, with a filter on it', async () => {
    const { sheet } = await written({ filename: 'x', title: 'T', columns: COLUMNS, rows: ROWS });
    const header = sheet.getRow(4);
    expect(header.values.slice(1)).toEqual(['Delivered', 'Supplier', 'Received', 'Value']);
    expect(header.getCell(1).font.bold).toBe(true);
    expect(header.getCell(1).fill.fgColor.argb).toBe('FF2B3336');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
    expect(sheet.autoFilter).toBeTruthy();
  });

  it('writes dates as dates and amounts as numbers, formatted', async () => {
    const { sheet } = await written({ filename: 'x', title: 'T', columns: COLUMNS, rows: ROWS });
    const first = sheet.getRow(5);
    expect(first.getCell(1).value).toBeInstanceOf(Date);
    expect(first.getCell(1).value.toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(first.getCell(1).numFmt).toBe('d mmm yyyy');
    expect(first.getCell(3).value).toBe(12.5);
    expect(first.getCell(4).value).toBe(600);
    expect(first.getCell(4).numFmt).toBe('"R" #,##0.00');
    expect(first.getCell(4).alignment.horizontal).toBe('right');
  });

  it('leaves an empty cell empty, not zero', async () => {
    const { sheet } = await written({ filename: 'x', title: 'T', columns: COLUMNS, rows: ROWS });
    expect(sheet.getRow(7).getCell(3).value).toBeNull();
    expect(sheet.getRow(7).getCell(4).value).toBeNull();
  });

  it('bands every other row and totals the money', async () => {
    const { sheet } = await written({ filename: 'x', title: 'T', columns: COLUMNS, rows: ROWS });
    expect(sheet.getRow(6).getCell(2).fill.fgColor.argb).toBe('FFF7F4EF');
    const total = sheet.getRow(8);
    expect(total.getCell(1).value).toBe('Total');
    expect(total.getCell(4).value).toBe(1850.5);
    expect(total.getCell(4).font.bold).toBe(true);
  });

  it('starts at the header when there is no title, and copes with no rows', async () => {
    const { sheet } = await written({ filename: 'empty', columns: COLUMNS, rows: [] });
    expect(sheet.getRow(1).values.slice(1)).toEqual(['Delivered', 'Supplier', 'Received', 'Value']);
    expect(sheet.rowCount).toBe(1);
  });
});
