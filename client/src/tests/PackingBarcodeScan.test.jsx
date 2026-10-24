// ─────────────────────────────────────────────────────────────
// client/src/tests/PackingBarcodeScan.test.jsx
//
// Scanning on the worker's packing screen (StaffSlipFlow.jsx) is a
// check, not a shortcut: a scan opens the item's Confirm step with the
// count scanned so far, and nothing is packed until Save is pressed. A
// product that is not on the pallet says so and opens nothing.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/pickingAPI', () => ({
  fetchPickingSlip: vi.fn(),
  assignSlip: vi.fn(),
  releaseSlip: vi.fn(),
  confirmItem: vi.fn(),
  flagItem: vi.fn(),
  completeSlip: vi.fn(),
}));
vi.mock('../services/productBarcodeAPI', () => ({
  lookupBarcode: vi.fn(),
  linkBarcode: vi.fn(),
}));

const pickingAPI = await import('../services/pickingAPI');
const barcodeAPI = await import('../services/productBarcodeAPI');
const { default: StaffSlipFlow } = await import('../features/packing/StaffSlipFlow');

const ME = { id: 7, role: 'warehouse_worker' };
const SLIP = {
  id: 12, ecd_name: 'Green Pastures', cohort: 'tuesday', child_count: 30, status: 'in_progress',
  assigned_to: ME.id, packer_name: 'Worker One',
  items: [
    { id: 1, product_id: 40, product_name: 'Beans 410g', required_quantity: 12, unit: 'each', status: 'pending', packed_quantity: null },
    { id: 2, product_id: 41, product_name: 'Oats', required_quantity: 2, unit: 'kg', status: 'pending', packed_quantity: null },
  ],
};

const BEANS = '4006381333931';
const OTHER = '96385074';
const MATCHES = {
  [BEANS]: { productId: 40, productName: 'Beans 410g', defaultUnit: 'each', unitsPerScan: 6, available: true },
  [OTHER]: { productId: 99, productName: 'Beans 800g', defaultUnit: 'each', unitsPerScan: 1, available: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.setItem('stf_packing_view_mode', 'full'); } catch { /* ignore */ }
  pickingAPI.fetchPickingSlip.mockResolvedValue(SLIP);
  pickingAPI.confirmItem.mockResolvedValue({});
  barcodeAPI.lookupBarcode.mockImplementation(async (code) => ({ code, format: 'ean13', match: MATCHES[code] ?? null }));
});

const open = async () => {
  render(<StaffSlipFlow currentUser={ME} slipId={12} onBack={vi.fn()} />);
  await screen.findByText('Green Pastures');
};
const scan = (user, code) => user.type(screen.getByLabelText('Barcode'), `${code}{Enter}`);

describe('packing: scanning as a check', () => {
  it('opens the item with the scanned count, and packs only on Save', async () => {
    const user = userEvent.setup();
    await open();

    await scan(user, BEANS);
    await scan(user, BEANS);
    expect(await screen.findByText(/Beans 410g: 12.* of 12.* scanned\. Save to confirm\./)).toBeInTheDocument();
    expect(pickingAPI.confirmItem).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(pickingAPI.confirmItem).toHaveBeenCalledWith(12, 1, 12, '');
  });

  it('warns about a product that is not on the pallet and opens nothing', async () => {
    const user = userEvent.setup();
    await open();

    await scan(user, OTHER);
    expect(await screen.findByText('Beans 800g is not on this pallet. Check you have the right item.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('has no scan bar on a packed pallet', async () => {
    pickingAPI.fetchPickingSlip.mockResolvedValue({
      ...SLIP, status: 'complete',
      items: SLIP.items.map((i) => ({ ...i, status: 'confirmed', packed_quantity: i.required_quantity })),
    });
    await open();
    expect(screen.queryByLabelText('Barcode')).toBeNull();
  });
});
