// ─────────────────────────────────────────────────────────────
// client/src/tests/AdminRecordLinks.test.js
//
// "Open" from the admin Activity and Archive screens goes to the
// record itself: the screen, with the record's id for it to open.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { linkFor, archiveLinkFor } from '../features/admin/recordLinks';

describe('record links', () => {
  it('opens the record on its own screen', () => {
    expect(linkFor({ screen: 'pickingSlips', id: '357' })).toBe('/noc/picking-slips?open=357');
    expect(linkFor({ screen: 'purchaseOrders', id: '12' })).toBe('/noc/purchase-orders?id=12');
    expect(linkFor({ screen: 'suppliers', id: '3' })).toBe('/admin/suppliers?open=3');
    expect(linkFor({ screen: 'volunteerEvent', id: 'abc' })).toBe('/volunteers/events/abc');
  });

  it('goes to the list when there is no single record, and nowhere for an unknown screen', () => {
    expect(linkFor({ screen: 'stockLedger', id: null })).toBe('/noc/stock-ledger');
    expect(linkFor({ screen: 'pickingSlips', id: null })).toBe('/noc/picking-slips');
    expect(linkFor({ screen: 'nope', id: '1' })).toBeNull();
    expect(linkFor(null)).toBeNull();
  });

  it('opens an archived item where it lives, if it has a screen', () => {
    expect(archiveLinkFor({ kind: 'beneficiary', id: '9' })).toBe('/noc/beneficiaries?open=9');
    expect(archiveLinkFor({ kind: 'programme', id: '2' })).toBeNull();
  });
});
