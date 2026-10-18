// ─────────────────────────────────────────────────────────────
// client/src/tests/AdminRecordLinks.test.js
//
// "Open" from the admin Activity and Archive screens goes to the
// record itself: the screen, with the record's id for it to open.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { linkFor, archiveLinkFor } from '../features/activityLog/recordLinks';

describe('record links', () => {
  it('opens the record on its own screen', () => {
    expect(linkFor({ screen: 'suppliers', id: '3' })).toBe('/admin/suppliers?open=3');
    expect(linkFor({ screen: 'products', id: '8' })).toBe('/admin/products?open=8');
    expect(linkFor({ screen: 'users', id: '5' })).toBe('/admin/users?open=5');
  });

  // Both screens are the admin's, and an admin cannot open a manager's
  // screen: those records are listed with no link.
  it('links nothing that lives on a manager screen', () => {
    for (const screen of ['pickingSlips', 'purchaseOrders', 'beneficiaries', 'receipts', 'stockLedger', 'decantingRecords', 'feedTheSoil', 'volunteerEvent']) {
      expect(linkFor({ screen, id: '1' }), screen).toBeNull();
    }
  });

  it('goes to the list when there is no single record, and nowhere for an unknown screen', () => {
    expect(linkFor({ screen: 'suppliers', id: null })).toBe('/admin/suppliers');
    expect(linkFor({ screen: 'nope', id: '1' })).toBeNull();
    expect(linkFor(null)).toBeNull();
  });

  it('opens an archived item where it lives, if the admin has that screen', () => {
    expect(archiveLinkFor({ kind: 'product', id: '9' })).toBe('/admin/products?open=9');
    expect(archiveLinkFor({ kind: 'beneficiary', id: '9' })).toBeNull();
    expect(archiveLinkFor({ kind: 'programme', id: '2' })).toBeNull();
  });
});
