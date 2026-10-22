// ─────────────────────────────────────────────────────────────
// src/tests/BarcodeMatchSuggestion.test.jsx
//
// The New barcode panel suggests the stock item an unknown code most
// likely is (Brand B's beans → the stock item with Brand A's), chosen
// with its reasons for a person to check. Nothing similar, a match not
// on this screen's list, or no answer: the panel as it always was.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/productBarcodeAPI', () => ({
  matchBarcode: vi.fn(),
  linkBarcode: vi.fn(),
  suggestProduct: vi.fn(),
}));

const api = await import('../services/productBarcodeAPI');
const { LinkBarcodePanel } = await import('../features/scan/ProductScanBar');
const { default: ProductBarcodeStart } = await import('../features/products/ProductBarcodeStart');

const CODE = '4006381333931';
const FOOD = { name: 'Brand B Baked beans in tomato sauce 410 g', quantity: '410 g' };
const BEANS = { productId: 12, productName: 'Baked Beans 410g', sku: 'BEANS', score: 9, reasons: ['size', 'name', 'kind'] };
const BEANS_PLAIN = { productId: 13, productName: 'Baked beans (loose)', sku: 'BL', score: 3, reasons: ['name'] };
const ORDER_LINES = [
  { productId: 11, label: 'Apples (Bulk Bag)', meta: 'APPLES' },
  { productId: 12, label: 'Baked Beans 410g', meta: 'BEANS' },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.linkBarcode.mockResolvedValue({ id: 1, unitsPerScan: 1 });
});

describe('the New barcode panel', () => {
  it('chooses the matching line on an order, says why, and links it when confirmed', async () => {
    api.matchBarcode.mockResolvedValue({ code: CODE, linkedTo: null, food: FOOD, matches: [BEANS] });
    const onLinked = vi.fn();
    const user = userEvent.setup();
    render(<LinkBarcodePanel code={CODE} choices={ORDER_LINES} onLinked={onLinked} onCancel={vi.fn()} />);

    expect(await screen.findByText(/This looks like Brand B Baked beans in tomato sauce 410 g\./)).toBeInTheDocument();
    expect(screen.getByText(/Closest stock item: Baked Beans 410g \(same pack size, same name, same kind of food\)/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Baked Beans 410g/ })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: 'Link and count' }));
    expect(api.linkBarcode).toHaveBeenCalledWith(12, { code: CODE, unitsPerScan: 1 });
    expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ productId: 12 }));
  });

  it('offers nothing when the match is not on this screen’s list', async () => {
    api.matchBarcode.mockResolvedValue({ code: CODE, linkedTo: null, food: FOOD, matches: [{ ...BEANS, productId: 99 }] });
    render(<LinkBarcodePanel code={CODE} choices={ORDER_LINES} onLinked={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Checking what this is')).toBeNull());
    expect(screen.queryByText(/Closest stock item/)).toBeNull();
    expect(screen.getByRole('radio', { name: /Baked Beans 410g/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('with a search instead of a list, chooses the best and offers the others', async () => {
    api.matchBarcode.mockResolvedValue({ code: CODE, linkedTo: null, food: FOOD, matches: [BEANS, BEANS_PLAIN] });
    const user = userEvent.setup();
    render(<LinkBarcodePanel code={CODE} onLinked={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Search stock items')).toHaveValue('Baked Beans 410g'));
    await user.click(screen.getByRole('button', { name: 'Or Baked beans (loose)' }));
    expect(screen.getByLabelText('Search stock items')).toHaveValue('Baked beans (loose)');

    await user.click(screen.getByRole('button', { name: 'Link and count' }));
    expect(api.linkBarcode).toHaveBeenCalledWith(13, { code: CODE, unitsPerScan: 1 });
  });

  it('is the panel it always was when nothing is similar or there is no signal', async () => {
    api.matchBarcode.mockResolvedValue({ code: CODE, linkedTo: null, food: FOOD, matches: [] });
    const { unmount } = render(<LinkBarcodePanel code={CODE} onLinked={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Checking what this is')).toBeNull());
    expect(screen.queryByText(/Closest stock item/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Link and count' })).toBeDisabled();
    unmount();

    api.matchBarcode.mockRejectedValue(Object.assign(new Error('offline'), { isNetworkError: true }));
    render(<LinkBarcodePanel code={CODE} onLinked={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Checking what this is')).toBeNull());
    expect(screen.queryByText(/Closest stock item/)).toBeNull();
  });
});

describe('Add product, started from a barcode', () => {
  it('points to the stock item it already looks like, so it is not added twice', async () => {
    api.suggestProduct.mockResolvedValue({
      code: CODE, linkedTo: null,
      suggestion: { name: FOOD.name, weightKg: 0.41, category: 'Baked beans' },
      matches: [BEANS],
    });
    const user = userEvent.setup();
    render(<ProductBarcodeStart onSeed={vi.fn()} onCode={vi.fn()} />);
    await user.type(screen.getByLabelText('Start from a barcode'), CODE);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/This looks like Baked Beans 410g, already in the catalogue/)).toBeInTheDocument();
  });
});
