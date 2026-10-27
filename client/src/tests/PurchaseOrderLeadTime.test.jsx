// ─────────────────────────────────────────────────────────────
// src/tests/PurchaseOrderLeadTime.test.jsx
//
// A new purchase order raised from Low stock starts on the products'
// preferred supplier, with the expected delivery date that supplier's
// agreed lead time from today, and says what the lead time is. An order
// being edited keeps its own date.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T08:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('the expected delivery date on a new order', () => {
  it('is the preferred supplier’s lead time from today, and says so', () => {
    render(<PurchaseOrderForm suppliers={SUPPLIERS} products={[product()]} initialProducts={[product()]} onSubmit={() => {}} />);
    expect(screen.getByLabelText('Expected delivery date')).toHaveValue('2026-10-31');
    expect(screen.getByText(/Cape Mills usually delivers in 4 days\./)).toBeInTheDocument();
  });

  it('is left for the manager when the products have different preferred suppliers', () => {
    const products = [product(), product({ id: 2, name: 'Beans', preferredSupplierId: 3 })];
    render(<PurchaseOrderForm suppliers={SUPPLIERS} products={products} initialProducts={products} onSubmit={() => {}} />);
    expect(screen.getByLabelText('Expected delivery date')).toHaveValue('');
  });

  it('is the order’s own date when editing', () => {
    const order = { supplierId: 2, expectedDeliveryDate: '2026-11-20', quickbooksPoId: '', notes: '', items: [] };
    render(<PurchaseOrderForm suppliers={SUPPLIERS} products={[product()]} initialValue={order} onSubmit={() => {}} />);
    expect(screen.getByLabelText('Expected delivery date')).toHaveValue('2026-11-20');
  });
});
