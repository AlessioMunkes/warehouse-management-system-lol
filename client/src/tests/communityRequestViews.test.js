import { describe, it, expect } from 'vitest';
import {
  VIEWS, viewById, rowsForView, displayStatus, isFlagged, packerLabel, shortProductNames,
} from '../features/communityRequests/requestViews';
import { toRequest } from '../services/communityRequestAPI';

const req = (over = {}) => ({
  id: 1, outcome: 'pending', itemsShortAt: null, items: [], handledByName: null, assignedToName: null, ...over,
});
const line = (over = {}) => ({ id: 1, productId: 5, productName: 'Rice', unit: 'kg', quantityApproved: 6, quantityReleased: 0, shortAt: null, ...over });

describe('tabs', () => {
  it('are, in order: Awaiting approval, Approved, Needs new items, Fulfilled, Declined, All', () => {
    expect(VIEWS.map((v) => v.label)).toEqual([
      'Awaiting approval', 'Approved', 'Needs new items', 'Fulfilled', 'Declined', 'All',
    ]);
  });

  it('use the ids the dashboard links to: pending, approved, needs-items', () => {
    expect(VIEWS.map((v) => v.id)).toEqual(['pending', 'approved', 'needs-items', 'fulfilled', 'declined', 'all']);
  });

  it('start on Awaiting approval, and fall back to it for an unknown id', () => {
    expect(viewById(null).id).toBe('pending');
    expect(viewById('nonsense').id).toBe('pending');
    expect(viewById('needs-items').id).toBe('needs-items');
  });

  it('put each request in exactly one of the first five tabs', () => {
    const rows = [
      req({ id: 1, outcome: 'pending' }),
      req({ id: 2, outcome: 'approved' }),
      req({ id: 3, outcome: 'approved', itemsShortAt: '2026-10-03T08:00:00Z' }),
      req({ id: 4, outcome: 'fulfilled' }),
      req({ id: 5, outcome: 'partially_fulfilled' }),
      req({ id: 6, outcome: 'declined' }),
    ];
    const ids = (id) => rowsForView(rows, viewById(id)).map((r) => r.id);
    expect(ids('pending')).toEqual([1]);
    expect(ids('approved')).toEqual([2]);
    expect(ids('needs-items')).toEqual([3]);
    expect(ids('fulfilled')).toEqual([4, 5]);
    expect(ids('declined')).toEqual([6]);
    expect(ids('all')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a flagged request is not under Approved, even though it is approved', () => {
    const flagged = req({ outcome: 'approved', itemsShortAt: '2026-10-03T08:00:00Z' });
    expect(viewById('approved').test(flagged)).toBe(false);
    expect(viewById('needs-items').test(flagged)).toBe(true);
  });

  it('Needs new items is sorted oldest-flagged first', () => {
    const rows = [
      req({ id: 1, outcome: 'approved', itemsShortAt: '2026-10-03T10:00:00Z' }),
      req({ id: 2, outcome: 'approved', itemsShortAt: '2026-10-03T08:00:00Z' }),
      req({ id: 3, outcome: 'approved', itemsShortAt: '2026-10-03T09:00:00Z' }),
    ];
    expect(rowsForView(rows, viewById('needs-items')).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('the other tabs keep the order they were given', () => {
    const rows = [req({ id: 3 }), req({ id: 1 }), req({ id: 2 })];
    expect(rowsForView(rows, viewById('pending')).map((r) => r.id)).toEqual([3, 1, 2]);
  });
});

describe('status', () => {
  it('a flagged approved request reads as needing new items; others show their outcome', () => {
    expect(displayStatus(req({ outcome: 'approved', itemsShortAt: '2026-10-03T08:00:00Z' }))).toBe('needs_items');
    expect(displayStatus(req({ outcome: 'approved' }))).toBe('approved');
    expect(displayStatus(req({ outcome: 'pending' }))).toBe('pending');
    expect(isFlagged(req({ outcome: 'declined', itemsShortAt: '2026-10-03T08:00:00Z' }))).toBe(false);
  });

  it('names the products that ran short', () => {
    const r = req({ items: [line({ productName: 'Rice', shortAt: 'x' }), line({ id: 2, productName: 'Beans' })] });
    expect(shortProductNames(r)).toEqual(['Rice']);
  });

  it('says who has it: the claimer first, else the packer a manager picked', () => {
    expect(packerLabel(req({ handledByName: 'Ayesha K', assignedToName: 'Sipho M' }))).toBe('Claimed by Ayesha K');
    expect(packerLabel(req({ assignedToName: 'Sipho M' }))).toBe('Assigned to Sipho M');
    expect(packerLabel(req())).toBeNull();
  });
});

describe('toRequest', () => {
  it('maps the approval fields, the names and the items from the server row', () => {
    const r = toRequest({
      id: 9, outcome: 'approved', approved_at: '2026-10-03T08:00:00Z', approved_by: 3,
      approved_by_first_name: 'Mia', approved_by_last_name: 'Day', assigned_to: 4,
      assigned_to_first_name: 'Sipho', assigned_to_last_name: 'M', items_short_at: '2026-10-03T09:00:00Z',
      items: [{ id: 1, productId: 5, productName: 'Rice', unit: 'kg', quantityApproved: '6', quantityReleased: 0, shortAt: null }],
    });
    expect(r).toMatchObject({
      approvedByName: 'Mia Day', assignedTo: 4, assignedToName: 'Sipho M', itemsShortAt: '2026-10-03T09:00:00Z',
    });
    expect(r.items).toEqual([{ id: 1, productId: 5, productName: 'Rice', unit: 'kg', quantityApproved: 6, quantityReleased: 0, shortAt: null }]);
  });

  it('copes with an older row that has no items and no approval', () => {
    const r = toRequest({ id: 1, outcome: 'fulfilled' });
    expect(r.items).toEqual([]);
    expect(r.itemsShortAt).toBeNull();
    expect(r.assignedToName).toBeNull();
  });
});
