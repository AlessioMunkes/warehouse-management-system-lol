// ─────────────────────────────────────────────────────────────
// src/tests/DonationItemsScan.test.jsx
//
// Scanning on a food donation (DonationItemsList.jsx). A scan does what
// searching the product and typing its quantity would: the empty row is
// filled first, the same product again adds to its row, and a different
// one gets a row of its own. Non-food donations have no scan bar, since
// there is no product to match.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/productBarcodeAPI', () => ({
  lookupBarcode: vi.fn(),
  linkBarcode: vi.fn(),
}));

const barcodeAPI = await import('../services/productBarcodeAPI');
const { DonationItemsList } = await import('../features/donation/DonationItemsList');

const RICE = '4006381333931';
const BEANS = '96385074';
const MATCHES = {
  [RICE]: { productId: 7, productName: 'Rice 1kg', defaultUnit: 'kg', unitsPerScan: 1, available: true },
  [BEANS]: { productId: 8, productName: 'Beans 410g', defaultUnit: 'each', unitsPerScan: 6, available: true },
};

const blank = { id: 'row-1', description: '', quantity: '', weight: '', expiryDate: '', productId: null, productLabel: '', unknownProduct: false };

let latest = [];
function Harness({ isFood = true }) {
  const [items, setItems] = useState([blank]);
  latest = items;
  return <DonationItemsList items={items} onChange={setItems} isFood={isFood} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  barcodeAPI.lookupBarcode.mockImplementation(async (code) => ({ code, format: 'ean13', match: MATCHES[code] ?? null }));
});

const scan = (user, code) => user.type(screen.getByLabelText('Barcode'), `${code}{Enter}`);

describe('donation items: scanning', () => {
  it('fills the empty row, adds to it on a repeat, and starts a row for a new product', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await scan(user, RICE);
    expect(await screen.findByText('Rice 1kg: 1 kg.')).toBeInTheDocument();
    await scan(user, RICE);
    expect(await screen.findByText('Rice 1kg: 2 kg.')).toBeInTheDocument();
    await scan(user, BEANS);
    expect(await screen.findByText('Beans 410g: 6 each.')).toBeInTheDocument();

    expect(latest).toHaveLength(2);
    expect(latest[0]).toMatchObject({ id: 'row-1', productId: 7, productLabel: 'Rice 1kg', quantity: '2', unit: 'kg' });
    expect(latest[1]).toMatchObject({ productId: 8, quantity: '6', unit: 'each' });
  });

  it('has no scan bar on a non-food donation', () => {
    render(<Harness isFood={false} />);
    expect(screen.queryByLabelText('Barcode')).not.toBeInTheDocument();
  });
});
