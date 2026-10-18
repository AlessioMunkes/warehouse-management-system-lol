// ─────────────────────────────────────────────────────────────
// src/tests/PurchaseOrderSeed.test.jsx
//
// The inventory screen's bulk "Raise purchase order" opens a new order
// with a line per ticked product. The form seeds those lines through
// the same suggestedLine the "Add low-stock items" button uses, so both
// suggest the same quantity: the shortfall to the reorder level,
// rounded up, never less than one.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PurchaseOrderForm from '../features/purchaseOrders/PurchaseOrderForm';
import { suggestedLine } from '../features/purchaseOrders/purchaseOrderLine';

const BEANS = { id: 8, name: 'Sugar beans', sku: 'BEA-001', available: 30, reorderAt: 50, weightKg: 1, unitCost: 20 };
const RICE  = { id: 7, name: 'Rice', sku: 'RICE-10', available: 100, reorderAt: 20, weightKg: null, unitCost: null };

describe('suggestedLine', () => {
  it('suggests the shortfall to the reorder level', () => {
    const line = suggestedLine(BEANS);
    expect(line.productId).toBe('8');
    expect(line.expectedQuantity).toBe('20');
    expect(line.lineCost).toBe('400.00');
  });

  it('never suggests less than one, even for a product above its level', () => {
    expect(suggestedLine(RICE).expectedQuantity).toBe('1');
  });
});

describe('PurchaseOrderForm — initialProducts', () => {
  it('starts a new order with one line per product', () => {
    render(
      <PurchaseOrderForm
        suppliers={[]}
        products={[BEANS, RICE]}
        initialProducts={[BEANS, RICE]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByLabelText('Quantity for line 1')).toHaveValue(20);
    expect(screen.getByLabelText('Quantity for line 2')).toHaveValue(1);
    expect(screen.queryByLabelText('Quantity for line 3')).not.toBeInTheDocument();
  });

  it('starts with one blank line when nothing was sent', () => {
    render(<PurchaseOrderForm suppliers={[]} products={[BEANS]} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText('Quantity for line 1')).toHaveValue(1);
    expect(screen.queryByLabelText('Quantity for line 2')).not.toBeInTheDocument();
  });
});
