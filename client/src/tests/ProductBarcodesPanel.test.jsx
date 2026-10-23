// ─────────────────────────────────────────────────────────────
// src/tests/ProductBarcodesPanel.test.jsx
//
// The admin's Barcodes section on a product (ProductBarcodes.jsx): Add
// barcode is never a greyed-out button nobody can explain. Pressed with
// nothing in the box, it says what is missing and sends nothing.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/productBarcodeAPI', () => ({
  listBarcodes: vi.fn(),
  linkBarcode: vi.fn(),
  removeBarcode: vi.fn(),
}));

const api = await import('../services/productBarcodeAPI');
const { default: ProductBarcodes } = await import('../features/products/ProductBarcodes');

const BUTTERNUT = { id: 4, name: 'Butternut' };

beforeEach(() => {
  vi.clearAllMocks();
  api.listBarcodes.mockResolvedValue([]);
  api.linkBarcode.mockResolvedValue({ id: 1, code: '4006381333931', unitsPerScan: 1 });
});

describe('adding a barcode to a product', () => {
  it('says what is missing instead of sitting greyed out', async () => {
    const user = userEvent.setup();
    render(<ProductBarcodes product={BUTTERNUT} canManage />);
    const add = await screen.findByRole('button', { name: 'Add barcode' });
    expect(add).toBeEnabled();

    await user.click(add);
    expect(screen.getByText('Scan or type the barcode first.')).toBeInTheDocument();
    expect(api.linkBarcode).not.toHaveBeenCalled();
  });

  it('adds it once a barcode is in the box', async () => {
    const user = userEvent.setup();
    render(<ProductBarcodes product={BUTTERNUT} canManage />);
    await user.type(await screen.findByLabelText('Barcode'), '4006381333931');
    await user.click(screen.getByRole('button', { name: 'Add barcode' }));
    expect(api.linkBarcode).toHaveBeenCalledWith(4, { code: '4006381333931', unitsPerScan: 1 });
    expect(await screen.findByText('4006381333931')).toBeInTheDocument();
  });

  it('refuses a misread before sending it', async () => {
    const user = userEvent.setup();
    render(<ProductBarcodes product={BUTTERNUT} canManage />);
    await user.type(await screen.findByLabelText('Barcode'), '4006381333932');
    await user.click(screen.getByRole('button', { name: 'Add barcode' }));
    expect(screen.getByText(/Not a barcode the system can read/)).toBeInTheDocument();
    expect(api.linkBarcode).not.toHaveBeenCalled();
  });
});
