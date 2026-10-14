// ─────────────────────────────────────────────────────────────
// server/__tests__/quickbooksImport.parity.test.js
//
// The server finds our PO number in a QuickBooks memo with the very
// pattern the import dialog reads a QuickBooks export with. They live
// in two places (the client cannot import the server), so this pins
// them to each other: every memo below must give the same answer in
// both, or one of them has been changed without the other.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { findPoNumbers as onServer } from '../src/utils/quickbooksImport.js';
import { findPoNumbers as onClient } from '../../client/src/features/purchaseOrders/quickbooksImport.js';

const MEMOS = [
  'PO-2026-0060',
  'po-2026-0061',
  '  PO-2026-0062  ',
  'PO - 2026 - 0063',
  'Soweto drive - PO-2026-0064 urgent',
  'Ref REPO-2026-0064',
  'PO-2026-0065, PO-2026-0066',
  'po-2026-0065 / PO-2026-0065',
  'PO-2026-00123456',
  'PO-2026-123',
  'PO-26-0001',
  'PO-2026-0001x',
  'xPO-2026-0001',
  '1PO-2026-0001',
  '(PO-2026-0001)',
  'PO - 2026-0001',
  '',
  null,
  undefined,
  'PO-2026-0067 · Expected delivery 17 Oct 2026 · Leave at gate 2',
];

describe('the server and the import dialog read a memo the same way', () => {
  it.each(MEMOS.map((m) => [String(m), m]))('%j', (_label, memo) => {
    expect(onServer(memo)).toEqual(onClient(memo));
  });

  it('finds what the dialog finds in the real export memos', () => {
    expect(onServer('PO-2026-0068')).toEqual(['PO-2026-0068']);
    expect(onServer('PO-2026-0065, PO-2026-0066')).toEqual(['PO-2026-0065', 'PO-2026-0066']);
  });
});
