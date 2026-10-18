// ─────────────────────────────────────────────────────────────
// client/src/tests/quickbooksImport.logic.test.js
//
// Reading a QuickBooks PO export: the real header row, our PO number
// in any cell and any spelling, the number column pre-selected, and
// the rows that cannot be trusted.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { parseCSV } from '../features/reporting/parseUpload';
import {
  findHeaderRow, readTable, guessNumberColumn, findPoNumbers, extractRows, sortRows,
  mergePreview, conflictShort, conflictDetail, summarise, summaryLines,
} from '../features/purchaseOrders/quickbooksImport';

const EXPORT = [
  'Purchase Orders,,,,,',
  '',
  'Date,Num,Vendor,Memo,Amount,Status',
  '2026-10-01,1001,Acme,PO-2026-0101,100.00,Open',
  '2026-10-01,1002,Acme,wms po-2026-0102,200.00,Open',
  '2026-10-02,1003,Acme,Ref PO-2026-0103 rice order,300.00,Open',
  '2026-10-02,1004,Office Co,Printer paper,50.00,Open',
].join('\n');

describe('findHeaderRow', () => {
  it('skips a title row and a blank row', () => {
    expect(findHeaderRow(parseCSV(EXPORT))).toBe(1);
  });

  it('is not fooled by a data-like first row', () => {
    expect(findHeaderRow([['12', '34', '56'], ['Date', 'Num', 'Memo']])).toBe(1);
  });

  it('falls back to row 1 when nothing looks like a header', () => {
    expect(findHeaderRow([['1', '2'], ['3', '4']])).toBe(0);
  });
});

describe('readTable', () => {
  it('uses the real header, not row 1', () => {
    const t = readTable(parseCSV(EXPORT));
    expect(t.columns).toEqual(['Date', 'Num', 'Vendor', 'Memo', 'Amount', 'Status']);
    expect(t.dataRows).toHaveLength(4);
    expect(t.dataRows[0].cells[1]).toBe('1001');
  });

  it('names blank and repeated headers so they can still be picked', () => {
    const t = readTable([['Num', '', 'Num', 'Memo'], ['1', 'x', '2', 'y']]);
    expect(t.columns).toEqual(['Num', 'Column 2', 'Num (2)', 'Memo']);
  });

  it('refuses an empty file and a file with no rows under the headers', () => {
    expect(() => readTable([])).toThrow(/empty/);
    expect(() => readTable([['Date', 'Num', 'Memo']])).toThrow(/no rows/);
  });
});

describe('guessNumberColumn', () => {
  it.each([
    [['Date', 'Num', 'Vendor', 'Memo', 'Amount', 'Status'], 'Num'],
    [['Date', 'Vendor', 'PO Number', 'Memo'], 'PO Number'],
    [['Date', 'Vendor', 'PO #', 'Memo'], 'PO #'],
    [['Date', 'Doc No.', 'Memo'], 'Doc No.'],
    [['Date', 'Number', 'Memo'], 'Number'],
  ])('%j picks %s', (columns, expected) => {
    expect(guessNumberColumn(columns)).toBe(expected);
  });

  it('prefers an exact "Num" over a looser match', () => {
    expect(guessNumberColumn(['Ref number', 'Num'])).toBe('Num');
  });

  it('does not match words that merely contain "no" or "num"', () => {
    expect(guessNumberColumn(['Date', 'Vendor', 'Memo', 'Amount', 'Status', 'Notes', 'Country'])).toBeNull();
  });
});

describe('findPoNumbers', () => {
  it.each([
    ['PO-2026-0101', ['PO-2026-0101']],
    ['wms po-2026-0102', ['PO-2026-0102']],
    ['Ref PO-2026-0103 rice order', ['PO-2026-0103']],
    ['PO - 2026 - 0104', ['PO-2026-0104']],
    ['po -2026- 0105', ['PO-2026-0105']],
    ['PO-2026-10234', ['PO-2026-10234']],
    ['PO-2026-0101 and PO-2026-0102', ['PO-2026-0101', 'PO-2026-0102']],
    ['PO-2026-0101, PO-2026-0101', ['PO-2026-0101']],
  ])('%s', (text, expected) => {
    expect(findPoNumbers(text)).toEqual(expected);
  });

  it.each([
    'PO-2026-12', 'PO-26-0101', 'REPO-2026-0101', 'PO2026-0101', 'Printer paper', '', null,
  ])('finds nothing in %j', (text) => {
    expect(findPoNumbers(text)).toEqual([]);
  });
});

const rowsOf = (csv, column = 'Num') => extractRows(readTable(parseCSV(csv)), column);

describe('extractRows', () => {
  it('finds our PO number in any cell', () => {
    const rows = rowsOf(EXPORT);
    expect(rows.map((r) => [r.quickbooksNumber, r.poNumbers])).toEqual([
      ['1001', ['PO-2026-0101']],
      ['1002', ['PO-2026-0102']],
      ['1003', ['PO-2026-0103']],
      ['1004', []],
    ]);
  });

  it('does not depend on the column being called Memo', () => {
    const csv = 'Date,Num,Description\n2026-10-01,7,"ordered under PO-2026-0150, urgent"';
    expect(rowsOf(csv)[0].poNumbers).toEqual(['PO-2026-0150']);
  });

  it('asks for a column that exists', () => {
    expect(() => rowsOf(EXPORT, 'Nope')).toThrow(/Choose the column/);
  });
});

const row = (rowNumber, quickbooksNumber, ...poNumbers) => ({ rowNumber, quickbooksNumber, poNumbers });

describe('sortRows', () => {
  it('splits rows without a PO number from the rest', () => {
    const { noPo, candidates } = sortRows([row(3, '1', 'PO-2026-0101'), row(4, '2')]);
    expect(noPo.map((r) => r.rowNumber)).toEqual([4]);
    expect(candidates.map((c) => [c.poNumber, c.quickbooksNumber])).toEqual([['PO-2026-0101', '1']]);
  });

  it('sends a row with two of our PO numbers to review and links nothing for it', () => {
    const { review, candidates } = sortRows([row(3, '1', 'PO-2026-0101', 'PO-2026-0102')]);
    expect(review).toMatchObject([{ rowNumber: 3, reason: 'multi_po' }]);
    expect(candidates).toEqual([]);
  });

  it('flags every row of a repeated PO number and links none', () => {
    const { review, candidates } = sortRows([
      row(3, '1', 'PO-2026-0101'), row(4, '2', 'PO-2026-0101'), row(5, '3', 'PO-2026-0102'),
    ]);
    expect(review.map((r) => [r.rowNumber, r.reason])).toEqual([[3, 'repeat_po'], [4, 'repeat_po']]);
    expect(candidates.map((c) => c.poNumber)).toEqual(['PO-2026-0102']);
  });

  it('counts a PO number inside a two-PO row as appearing there too', () => {
    const { review } = sortRows([
      row(3, '1', 'PO-2026-0101', 'PO-2026-0102'), row(4, '2', 'PO-2026-0102'),
    ]);
    expect(review.map((r) => [r.rowNumber, r.reason])).toEqual([[3, 'multi_po'], [4, 'repeat_po']]);
  });

  it('flags the same QuickBooks number against different PO numbers', () => {
    const { review, candidates } = sortRows([
      row(3, '9', 'PO-2026-0101'), row(4, '9', 'PO-2026-0102'), row(5, '5', 'PO-2026-0103'),
    ]);
    expect(review.map((r) => [r.rowNumber, r.reason])).toEqual([[3, 'repeat_qb'], [4, 'repeat_qb']]);
    expect(candidates).toHaveLength(1);
  });

  it('flags a row that has a PO number but no QuickBooks number', () => {
    const { review } = sortRows([row(3, '', 'PO-2026-0101')]);
    expect(review[0].reason).toBe('no_qb');
  });
});

describe('mergePreview', () => {
  it('groups the server answers back onto the rows', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map((x, i) => ({ rowNumber: i, poNumber: `PO-${x}`, quickbooksNumber: x }));
    const g = mergePreview(candidates, [
      { status: 'will_link' }, { status: 'unchanged' },
      { status: 'conflict', linkedToPoNumber: 'PO-z' }, { status: 'not_found' }, { status: 'invalid', message: 'bad' },
    ]);
    expect(g.willLink).toHaveLength(1);
    expect(g.unchanged).toHaveLength(1);
    expect(g.conflicts[0].linkedToPoNumber).toBe('PO-z');
    expect(g.notFound).toHaveLength(1);
    expect(g.extraReview[0].message).toBe('bad');
  });
});

describe('conflict wording and the confirm summary', () => {
  const moves = { poNumber: 'PO-2026-0101', quickbooksNumber: 'QB-3', linkedToPoNumber: 'PO-2026-0103', linkedQuickbooksNumber: null };
  const swaps = { poNumber: 'PO-2026-0102', quickbooksNumber: 'QB-2', linkedToPoNumber: null, linkedQuickbooksNumber: 'QB-OLD' };

  it('says where a link moves from, in one short line', () => {
    expect(conflictShort(moves)).toBe('Moves from PO-2026-0103');
    expect(conflictShort(swaps)).toBe('Replaces QB-OLD');
    expect(conflictDetail(moves)).toMatch(/PO-2026-0103 becomes unlinked/);
  });

  it('totals the confirm summary instead of listing rows', () => {
    const s = summarise(Array(12).fill({}), [moves, moves, swaps]);
    expect(summaryLines(s)).toEqual([
      '12 will link.',
      '2 links will move to a different PO, which becomes unlinked.',
      '1 PO will switch to a different QuickBooks PO number.',
    ]);
    expect(s.total).toBe(15);
  });

  it('leaves out lines that do not apply', () => {
    expect(summaryLines(summarise(Array(3).fill({}), []))).toEqual(['3 will link.']);
    expect(summaryLines(summarise([], [moves]))).toEqual(['1 link will move to a different PO, which becomes unlinked.']);
  });
});
