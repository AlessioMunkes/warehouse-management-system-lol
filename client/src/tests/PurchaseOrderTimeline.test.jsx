// The PO timeline says who raised the order, who approved it and who
// marked it in transit, and when, from the status changes the server
// reads off the audit trail.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PurchaseOrderTimeline from '../features/purchaseOrders/PurchaseOrderTimeline';

const po = (over = {}) => ({
  status: 'in_transit', statusLabel: 'In transit', statusReason: '', statusChangedAt: '2026-10-26T09:00:00Z',
  createdByName: 'Grizel Goliath', createdAt: '2026-10-26T07:00:00Z',
  deliveries: [], statusChanges: [], ...over,
});

describe('PurchaseOrderTimeline', () => {
  it('names who approved the order and who marked it in transit', () => {
    render(<PurchaseOrderTimeline purchaseOrder={po({
      statusChanges: [
        { status: 'approved', statusLabel: 'Approved', at: '2026-10-26T08:00:00Z', actorName: 'Thandi Petersen', reason: '' },
        { status: 'in_transit', statusLabel: 'In transit', at: '2026-10-26T09:00:00Z', actorName: 'Grizel Goliath', reason: '' },
      ],
    })} />);

    const titles = screen.getAllByRole('listitem').map((li) => li.querySelector('p').textContent);
    expect(titles).toEqual(['Order raised', 'Approved', 'In transit']);
    expect(screen.getByText(/^Thandi Petersen · /)).toBeInTheDocument();
  });

  // Receiving moves an order on with no person's change: where it stands
  // now is still shown, once.
  it('adds where the order stands when receiving moved it there', () => {
    render(<PurchaseOrderTimeline purchaseOrder={po({
      status: 'completed', statusLabel: 'Completed', statusChangedAt: '2026-10-26T10:00:01Z',
      statusChanges: [{ status: 'approved', statusLabel: 'Approved', at: '2026-10-26T08:00:00Z', actorName: 'Thandi Petersen', reason: '' }],
      deliveries: [{ recordedAt: '2026-10-26T10:00:00Z', receivedByName: 'Mcebisi Ndlovu', hasDiscrepancies: false }],
    })} />);

    const titles = screen.getAllByRole('listitem').map((li) => li.querySelector('p').textContent);
    expect(titles).toEqual(['Order raised', 'Approved', 'Delivery received', 'Completed']);
  });
});
