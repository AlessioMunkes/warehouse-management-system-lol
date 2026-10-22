// ─────────────────────────────────────────────────────────────
// src/tests/CountAreaScan.test.jsx
//
// Scanning in the manager's area count (CountAreaDialog.jsx): the first
// scan of a product replaces the figure it came in with, each one after
// adds its units per scan, a product not on the list is added, and the
// Enter a scanner sends never saves the count.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/productBarcodeAPI', () => ({
  lookupBarcode: vi.fn(),
  getAllBarcodes: vi.fn(),
  recordScan: vi.fn(),
}));

const api = await import('../services/productBarcodeAPI');
const { forgetKnownBarcodes } = await import('../features/scan/useBarcodeReader');
const { default: CountAreaDialog } = await import('../features/warehouseMap/CountAreaDialog');

const AREA = {
  id: 3, name: 'Dry store A', kind: 'dry', preferredProductIds: [], preferredCategories: [],
  items: [{ productId: 7, name: 'Rice 1kg', unit: 'each', about: 40 }],
};
const PRODUCTS = [
  { id: 7, name: 'Rice 1kg', sku: 'RICE', unit: 'each', unplaced: 0, onHand: 40, storageType: 'dry' },
  { id: 8, name: 'Beans 410g', sku: 'BEANS', unit: 'each', unplaced: 0, onHand: 10, storageType: 'dry' },
];
const LINKS = [
  { code: '4006381333931', productId: 7, productName: 'Rice 1kg', defaultUnit: 'each', unitsPerScan: 10, available: true },
  { code: '96385074', productId: 8, productName: 'Beans 410g', defaultUnit: 'each', unitsPerScan: 6, available: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  forgetKnownBarcodes();
  api.getAllBarcodes.mockResolvedValue(LINKS);
  api.recordScan.mockResolvedValue(undefined);
});

describe('area count: scanning', () => {
  it('counts by scan, adds a new product, and never saves on Enter', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<CountAreaDialog area={AREA} products={PRODUCTS} onSave={onSave} onClose={vi.fn()} />);
    await waitFor(() => expect(api.getAllBarcodes).toHaveBeenCalled());
    const box = screen.getByLabelText('Barcode');

    await user.type(box, '4006381333931{Enter}');
    await user.type(box, '4006381333931{Enter}');
    expect(await screen.findByText('Rice 1kg: 20 counted.')).toBeInTheDocument();
    expect(screen.getByLabelText('Rice 1kg')).toHaveValue(20);

    await user.type(box, '96385074{Enter}');
    expect(await screen.findByText('Beans 410g: 6 counted.')).toBeInTheDocument();
    expect(screen.getByLabelText('Beans 410g')).toHaveValue(6);

    expect(onSave).not.toHaveBeenCalled();
    expect(api.recordScan).toHaveBeenCalledWith({ screen: 'stock_count', outcome: 'counted', productId: 8, referenceId: 3 });

    await user.click(screen.getByRole('button', { name: 'Save count' }));
    expect(onSave).toHaveBeenCalledWith([{ productId: 7, quantity: 20 }, { productId: 8, quantity: 6 }]);
  });
});
