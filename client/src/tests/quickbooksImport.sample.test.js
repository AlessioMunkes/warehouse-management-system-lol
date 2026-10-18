// ─────────────────────────────────────────────────────────────
// client/src/tests/quickbooksImport.sample.test.js
//
// A sample shaped like a QuickBooks Online purchase-order export
// (fixtures/quickbooks-po-export-sample.csv): a title row, a blank row,
// then the columns. The reader must keep making sense of it.
// ─────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCSV } from '../features/reporting/parseUpload';
import { readTable, guessNumberColumn, extractRows, sortRows } from '../features/purchaseOrders/quickbooksImport';

const text = readFileSync(resolve(process.cwd(), 'src/tests/fixtures/quickbooks-po-export-sample.csv'), 'utf8');

describe('the demo export', () => {
  const table = readTable(parseCSV(text));
  const sorted = sortRows(extractRows(table, guessNumberColumn(table.columns)));

  it('has the QuickBooks columns and picks Num', () => {
    expect(table.columns).toEqual(['Date', 'Num', 'Vendor', 'Memo', 'Amount', 'Status']);
    expect(guessNumberColumn(table.columns)).toBe('Num');
  });

  it('offers four POs to check: three that exist, in mixed spellings, and one that does not', () => {
    expect(sorted.candidates.map((c) => [c.poNumber, c.quickbooksNumber])).toEqual([
      ['PO-2026-0101', 'DEMO-1001'],
      ['PO-2026-0102', 'DEMO-1002'],
      ['PO-2026-0103', 'DEMO-1003'],
      ['PO-2026-0999', 'DEMO-1005'],   // the server answers "not found"
    ]);
  });

  it('shows one row without a PO number', () => {
    expect(sorted.noPo.map((r) => r.quickbooksNumber)).toEqual(['DEMO-1004']);
  });

  it('flags the row with two PO numbers and the PO number used twice', () => {
    expect(sorted.review.map((r) => [r.quickbooksNumber, r.reason])).toEqual([
      ['DEMO-1006', 'multi_po'],
      ['DEMO-1007', 'repeat_po'],
      ['DEMO-1008', 'repeat_po'],
    ]);
  });
});
