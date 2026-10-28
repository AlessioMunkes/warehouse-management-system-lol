// ─────────────────────────────────────────────────────────────
// src/tests/PurchaseOrderLeadTime.test.jsx
//
// A new purchase order raised from Low stock starts on the products'
// preferred supplier, and says under the expected delivery date what
// that supplier's agreed lead time is. The date itself is the
// manager's to set; the lead time does not fill it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PurchaseOrderForm from '../features/purchaseOrders/PurchaseOrderForm';

const SUPPLIERS = [
  { id: 2, name: 'Cape Mills', isActive: true, expectedLeadTimeDays: 4, suppliedProducts: [] },
  { id: 3, name: 'Fresh Co', isActive: true, expectedLeadTimeDays: null, suppliedProducts: [] },
];
const product = (over) => ({
  id: 1, name: 'Rice', sku: 'RICE', defaultUnit: 'kg', weightKg: 1, unitCost: 20,
  reorderAt: 50, available: 10, preferredSupplierId: 2, ...over,
});

describe('the lead time on a new order', () => {
  it('shows the preferred supplier’s lead time and leaves the date blank', () => {
    render(<PurchaseOrderForm suppliers={SUPPLIERS} products={[product()]} initialProducts={[product()]} onSubmit={() => {}} />);
    expect(screen.getByText(/Cape Mills usually delivers in 4 days\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Expected delivery date')).toHaveValue('');
  });

  it('says nothing about lead time when the supplier has none recorded', () => {
    const p = product({ preferredSupplierId: 3 });
    render(<PurchaseOrderForm suppliers={SUPPLIERS} products={[p]} initialProducts={[p]} onSubmit={() => {}} />);
    expect(screen.queryByText(/usually delivers in/)).not.toBeInTheDocument();
  });

  it('keeps the order’s own date when editing', () => {
    const order = { supplierId: 2, expectedDeliveryDate: '2026-11-20', quickbooksPoId: '', notes: '', items: [] };
    render(<PurchaseOrderForm suppliers={SUPPLIERS} products={[product()]} initialValue={order} onSubmit={() => {}} />);
    expect(screen.getByLabelText('Expected delivery date')).toHaveValue('2026-11-20');
  });
});
