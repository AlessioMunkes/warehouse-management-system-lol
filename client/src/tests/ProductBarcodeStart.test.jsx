// ─────────────────────────────────────────────────────────────
// src/tests/ProductBarcodeStart.test.jsx
//
// "Start from a barcode" on Add product: a suggestion fills the form
// (never saves it), a code already on a product is named, and an
// unknown one still leaves the code to link.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/productBarcodeAPI', () => ({ suggestProduct: vi.fn() }));
vi.mock('../features/scan/PalletScanner', () => ({
  default: ({ onCode }) => <button type="button" onClick={() => onCode('4006381333931')}>Pretend to read</button>,
}));

const api = await import('../services/productBarcodeAPI');
const { default: ProductBarcodeStart } = await import('../features/products/ProductBarcodeStart');

beforeEach(() => { vi.clearAllMocks(); });

const lookUp = async (user, code) => {
  await user.type(screen.getByLabelText('Start from a barcode'), code);
  await user.click(screen.getByRole('button', { name: 'Look up' }));
};

describe('start from a barcode', () => {
  it('fills the form from the suggestion and keeps the code to link', async () => {
    api.suggestProduct.mockResolvedValue({
      code: '4006381333931', linkedTo: null,
      suggestion: { name: 'Koo Baked beans 410 g', weightKg: 0.41, category: 'Canned beans' },
    });
    const onSeed = vi.fn(); const onCode = vi.fn();
    const user = userEvent.setup();
    render(<ProductBarcodeStart onSeed={onSeed} onCode={onCode} />);

    await lookUp(user, '4006381333931');
    await waitFor(() => expect(onSeed).toHaveBeenCalledWith({
      name: 'Koo Baked beans 410 g', weightKg: 0.41, category: 'Canned beans', defaultUnit: 'each',
    }));
    expect(onCode).toHaveBeenCalledWith('4006381333931');
    expect(screen.getByText(/Filled in from Open Food Facts/)).toBeInTheDocument();
  });

  it('names the product that already has the code, and links nothing', async () => {
    api.suggestProduct.mockResolvedValue({
      code: '4006381333931', linkedTo: { productId: 9, productName: 'Beans 410g' }, suggestion: null,
    });
    const onSeed = vi.fn(); const onCode = vi.fn();
    const user = userEvent.setup();
    render(<ProductBarcodeStart onSeed={onSeed} onCode={onCode} />);

    await lookUp(user, '4006381333931');
    expect(await screen.findByText('This barcode is already on Beans 410g.')).toBeInTheDocument();
    expect(onSeed).not.toHaveBeenCalled();
    expect(onCode).toHaveBeenCalledWith(null);
  });

  it('refuses a misread before asking anyone', async () => {
    const user = userEvent.setup();
    render(<ProductBarcodeStart onSeed={vi.fn()} onCode={vi.fn()} />);
    await lookUp(user, '4006381333932');
    expect(await screen.findByText(/Not a barcode the system can read/)).toBeInTheDocument();
    expect(api.suggestProduct).not.toHaveBeenCalled();
  });

  it('looks a pack up as soon as the camera reads it', async () => {
    api.suggestProduct.mockResolvedValue({ code: '4006381333931', linkedTo: null, suggestion: null, matches: [] });
    const user = userEvent.setup();
    render(<ProductBarcodeStart onSeed={vi.fn()} onCode={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Camera' }));
    await user.click(screen.getByRole('button', { name: 'Pretend to read' }));
    expect(screen.getByLabelText('Start from a barcode')).toHaveValue('4006381333931');
    expect(api.suggestProduct).toHaveBeenCalledWith('4006381333931');
  });

  it('says what is missing when Look up is pressed with nothing in the box', async () => {
    const user = userEvent.setup();
    render(<ProductBarcodeStart onSeed={vi.fn()} onCode={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByText('Scan or type the barcode first.')).toBeInTheDocument();
    expect(api.suggestProduct).not.toHaveBeenCalled();
  });
});
