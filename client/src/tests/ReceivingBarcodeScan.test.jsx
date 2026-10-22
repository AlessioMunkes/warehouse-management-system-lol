// ─────────────────────────────────────────────────────────────
// src/tests/ReceivingBarcodeScan.test.jsx
//
// Scanning as a second way to count a delivery (ReceivingFlow.jsx,
// features/scan/ProductScanBar.jsx). A scanner "types" into the
// Barcode box and presses Enter, which is what these tests do.
//
//   - the first scan of a line replaces the pre-filled ordered figure,
//     and each scan after adds the barcode's units per scan
//   - a product not on the order changes nothing and says so
//   - an unknown code asks which line's product it is, links it, and
//     counts it
//   - a misread never reaches the server
//
// The receiving and barcode APIs are mocked; the flow is real.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/receivingAPI', () => ({
  default: {
    getPurchaseOrders: vi.fn(),
    getOrdersAwaitingApproval: vi.fn(),
    getPurchaseOrderItems: vi.fn(),
    recordDelivery: vi.fn(),
  },
}));

vi.mock('../services/productBarcodeAPI', () => ({
  lookupBarcode: vi.fn(),
  linkBarcode: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  newIdempotencyKey: () => 'test-key',
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, firstName: 'Mcebisi', lastName: 'Ndlovu', role: 'warehouse_worker' } }),
}));

vi.mock('../features/receiving/DeliveryNotePDF', () => ({ default: () => null }));

const receivingAPI = (await import('../services/receivingAPI')).default;
const barcodeAPI = await import('../services/productBarcodeAPI');
const { default: ReceivingFlow } = await import('../features/receiving/ReceivingFlow');

const ORDERS = [
  { id: 86, supplier_id: 2, supplier_name: 'Cape Cold Storage', status: 'pending', expected_delivery_date: '2026-09-02' },
];
const ITEMS = [
  { purchase_order_item_id: 501, product_id: 11, product_name: 'Apples (Bulk Bag)', sku: 'APPLES-10KG-001', expected_quantity: 47, expected_weight_kg: null },
  { purchase_order_item_id: 502, product_id: 12, product_name: 'Canned Baked Beans 410g', sku: 'BEANS-410G-001', expected_quantity: 45, expected_weight_kg: null },
];

const BEANS_CASE = '4006381333931';
const match = (over = {}) => ({
  productId: 12, productName: 'Canned Baked Beans 410g', sku: 'BEANS-410G-001',
  defaultUnit: 'each', unitsPerScan: 12, available: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); localStorage.setItem('stf_receiving_view_mode', 'full'); } catch { /* ignore */ }
  receivingAPI.getPurchaseOrders.mockResolvedValue(ORDERS);
  receivingAPI.getOrdersAwaitingApproval.mockResolvedValue([]);
  receivingAPI.getPurchaseOrderItems.mockResolvedValue(ITEMS);
});

const openOrder = async (user) => {
  render(<ReceivingFlow />);
  await user.selectOptions(await screen.findByRole('combobox', { name: /Which order/i }), '86');
  await user.click(screen.getByRole('button', { name: 'Start counting' }));
  await screen.findByText('Apples (Bulk Bag)');
};

const scan = async (user, code) => {
  await user.type(screen.getByLabelText('Barcode'), `${code}{Enter}`);
};

describe('receiving: counting by barcode', () => {
  it('counts up from zero by the units per scan', async () => {
    barcodeAPI.lookupBarcode.mockResolvedValue({ code: BEANS_CASE, format: 'ean13', match: match() });
    const user = userEvent.setup();
    await openOrder(user);

    await scan(user, BEANS_CASE);
    expect(await screen.findByText('Canned Baked Beans 410g: 12 counted of 45.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();

    await scan(user, BEANS_CASE);
    expect(await screen.findByText('Canned Baked Beans 410g: 24 counted of 45.')).toBeInTheDocument();
    // The second scan of the same code is answered on the screen, not
    // asked of the server again.
    expect(barcodeAPI.lookupBarcode).toHaveBeenCalledTimes(1);
  });

  it('leaves the count alone for a product that is not on this order', async () => {
    barcodeAPI.lookupBarcode.mockResolvedValue({
      code: BEANS_CASE, format: 'ean13', match: match({ productId: 99, productName: 'Sugar 2kg' }),
    });
    const user = userEvent.setup();
    await openOrder(user);

    await scan(user, BEANS_CASE);
    expect(await screen.findByText('Sugar 2kg is not on this order.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
  });

  it('links a new barcode to a line on the order, then counts it', async () => {
    barcodeAPI.lookupBarcode.mockResolvedValue({ code: BEANS_CASE, format: 'ean13', match: null });
    barcodeAPI.linkBarcode.mockResolvedValue({ id: 1, productId: 12, code: BEANS_CASE, unitsPerScan: 6 });
    const user = userEvent.setup();
    await openOrder(user);

    await scan(user, BEANS_CASE);
    expect(await screen.findByText(/is not linked to a product yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Canned Baked Beans 410g/ }));
    const units = screen.getByLabelText('Units per scan');
    await user.clear(units);
    await user.type(units, '6');
    await user.click(screen.getByRole('button', { name: 'Link and count' }));

    expect(barcodeAPI.linkBarcode).toHaveBeenCalledWith(12, { code: BEANS_CASE, unitsPerScan: 6 });
    expect(await screen.findByText('Canned Baked Beans 410g: 6 counted of 45.')).toBeInTheDocument();
  });

  it('answers a misread without asking the server', async () => {
    const user = userEvent.setup();
    await openOrder(user);

    await scan(user, '4006381333932');
    expect(await screen.findByText(/not a barcode the system can read/)).toBeInTheDocument();
    expect(barcodeAPI.lookupBarcode).not.toHaveBeenCalled();
  });
});
