// ─────────────────────────────────────────────────────────────
// client/src/tests/quickbooksImport.realExport.test.js
//
// A REAL export: the "Open Purchase Order List by Vendor" report,
// exported to Excel from a QuickBooks Online company
// (fixtures/qbo-open-purchase-order-list-by-vendor.xlsx, not made by
// hand). Unlike a flat table it has a three-line title block, a header
// row whose first cell is empty, a heading for each vendor, a
// "Total for <vendor>" row under each, a grand TOTAL, and a timestamp at
// the foot. The reader has to find its way through all of that, and
// report only the real transactions that name no PO number.
// ─────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readGrid } from '../features/reporting/parseUpload';
import {
  readTable, guessNumberColumn, extractRows, sortRows, looksLikeDate,
} from '../features/purchaseOrders/quickbooksImport';

const bytes = readFileSync(resolve(process.cwd(), 'src/tests/fixtures/qbo-open-purchase-order-list-by-vendor.xlsx'));

// Read it the way the dialog does: through readGrid, from a File.
const load = async () => {
  const file = new File([bytes], 'Open Purchase Order List by Vendor.xlsx');
  if (typeof file.arrayBuffer !== 'function') {
    file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const { grid } = await readGrid(file);
  const table = readTable(grid);
  const numberColumn = guessNumberColumn(table.columns);
  return { grid, table, numberColumn, sorted: sortRows(extractRows(table, numberColumn)) };
};

describe('the real "Open Purchase Order List by Vendor" export', () => {
  it('finds the header row below the three title lines, and names the empty first column', async () => {
    const { grid, table } = await load();
    expect(grid[0][0]).toBe('Sandbox Company US f249');
    expect(grid[1][0]).toBe('Open Purchase Order List by Vendor');
    expect(table.columns).toEqual(['Column 1', 'Date', 'Num', 'Memo', 'Ship via', 'Amount', 'Open Balance']);
  });

  it('picks the Num column by itself', async () => {
    expect((await load()).numberColumn).toBe('Num');
  });

  it('matches every PO number from the Memo column, to the number QuickBooks shows for it', async () => {
    const { sorted } = await load();
    expect(sorted.candidates.map((c) => [c.poNumber, c.quickbooksNumber])).toEqual([
      ['PO-2026-0069', 'PO-2026-0069'],
      ['PO-2026-0068', 'PO-2026-0068'],
      ['PO-2026-0070', 'PO-2026-0070'],
      ['PO-2026-0071', 'PO-2026-0071'],
      ['PO-2026-0072', 'PO-2026-0072'],
      ['PO-2026-0059', 'PO-2026-0059'],
    ]);
    expect(sorted.review).toEqual([]);
  });

  it('reports only #1099 and #1002 as having no PO number', async () => {
    const { sorted } = await load();
    expect(sorted.noPo.map((r) => r.quickbooksNumber)).toEqual(['1099', '1002']);
  });

  it('does not count vendor headings, "Total for" rows, TOTAL or the footer', async () => {
    const { sorted } = await load();
    // 3 vendor headings + 3 "Total for" + TOTAL + the timestamp footer
    expect(sorted.ignored).toHaveLength(8);
    expect(sorted.ignored.every((r) => r.isTransaction === false && r.poNumbers.length === 0)).toBe(true);
    const text = (await load()).table.dataRows
      .filter((d) => sorted.ignored.some((r) => r.rowNumber === d.rowNumber))
      .map((d) => d.cells[0]);
    expect(text).toEqual(expect.arrayContaining([
      'Nonexistent Supplier Ltd', 'Total for Nonexistent Supplier Ltd', "Tania's Nursery", "Total for Tania's Nursery",
      'Tim Philip Masonry', 'Total for Tim Philip Masonry', 'TOTAL',
    ]));
    expect(text.some((t) => /GMTZ/.test(t))).toBe(true);
  });

  it('accounts for every row: linked-to, held for review, no PO number, or ignored', async () => {
    const { table, sorted } = await load();
    expect(sorted.candidates.length + sorted.review.length + sorted.noPo.length + sorted.ignored.length)
      .toBe(table.dataRows.length);
  });
});

describe('what makes a row a transaction', () => {
  const columns = ['Column 1', 'Date', 'Num', 'Memo', 'Amount'];
  const sort = (...rows) => sortRows(extractRows(
    { columns, dataRows: rows.map((cells, i) => ({ rowNumber: i + 2, cells })) }, 'Num'));

  it('is having its own QuickBooks number', () => {
    const { noPo, ignored } = sort(['', '', '1099', '', '28.00']);
    expect(noPo).toHaveLength(1);
    expect(ignored).toHaveLength(0);
  });

  it('is having a date, even without a number', () => {
    const { noPo, ignored } = sort(['', '10/14/2026', '', 'no po here', '28.00']);
    expect(noPo).toHaveLength(1);
    expect(ignored).toHaveLength(0);
  });

  it('is not a vendor heading, a total or a footer', () => {
    const { noPo, ignored } = sort(
      ["Tania's Nursery", '', '', '', ''],
      ["Total for Tania's Nursery", '', '', '', '$2,762.61'],
      ['TOTAL', '', '', '', '$3,000.11'],
      [' Tuesday, October 13, 2026 11:52 PM GMTZ', '', '', '', ''],
    );
    expect(noPo).toHaveLength(0);
    expect(ignored).toHaveLength(4);
  });

  it('still counts a transaction that names a PO number, however its row looks', () => {
    const { candidates, ignored } = sort(['', '10/14/2026', '1201', 'PO-2026-0060', '110.00']);
    expect(candidates).toHaveLength(1);
    expect(ignored).toHaveLength(0);
  });

  it('keeps counting every row as a transaction when the file has no Date column and no number', () => {
    // Nothing says it is furniture, so nothing is hidden: only rows with
    // neither a number nor a date are ever ignored.
    const { noPo } = sortRows(extractRows(
      { columns: ['Vendor', 'Num', 'Memo'], dataRows: [{ rowNumber: 2, cells: ['Acme', '5', 'hello'] }] }, 'Num'));
    expect(noPo).toHaveLength(1);
  });

  it.each([
    ['10/14/2026', true], ['14/10/2026', true], ['2026-10-14', true], ['14.10.2026', true],
    ['Oct 14, 2026', true], ['October 14, 2026', true], ['14 Oct 2026', true],
    ['1099', false], ['PO-2026-0001', false], ['TOTAL', false], ['', false], [null, false], ['$112.50', false],
  ])('reads %j as a date: %s', (value, expected) => {
    expect(looksLikeDate(value)).toBe(expected);
  });
});
