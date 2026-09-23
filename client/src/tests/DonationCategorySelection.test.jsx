import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DonationItemsList } from '../features/donation/components/DonationItemsList';
import { createPendingDonation } from '../services/donationAPI';

const okResponse = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ success: true, data: { id: 1 } }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const draft = (overrides = {}) => ({
  donorName: 'Jane Donor',
  contactMethod: 'email',
  contactDetails: 'jane@example.com',
  donorTaxReference: '',
  donorConsentGiven: false,
  estimatedValueZar: '100',
  isFood: true,
  notes: '',
  idempotencyKey: 'idem-1',
  items: [{
    id: 'matched',
    description: 'Rice',
    quantity: '5',
    unit: 'kg',
    productId: 7,
    productLabel: 'Rice 10kg',
    unknownProduct: false,
  }],
  ...overrides,
});

describe('Donation phase 1-4 intake', () => {
  it('renders product search, item fields and unknown product action for food donations', () => {
    render(<DonationItemsList items={draft().items} isFood onChange={vi.fn()} />);

    expect(screen.getByLabelText(/search stock items/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit')).toBeInTheDocument();
    // "Mark as Unknown Product" button hidden when productId is set
    expect(screen.queryByRole('button', { name: 'Mark as Unknown Product' })).not.toBeInTheDocument();
  });

  it('shows Mark as Unknown Product when no product is matched', () => {
    const itemsNoProduct = [{ ...draft().items[0], productId: null, productLabel: '', unknownProduct: false }];
    render(<DonationItemsList items={itemsNoProduct} isFood onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Mark as Unknown Product' })).toBeInTheDocument();
  });

  it('maps a matched food product to the pending donation payload', async () => {
    const fetch = vi.fn(okResponse);
    vi.stubGlobal('fetch', fetch);

    await createPendingDonation(draft());

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.donationCategory).toBeNull();
    expect(payload.donorContact).toBe('jane@example.com');
    expect(payload.items[0]).toEqual(expect.objectContaining({
      productId: 7,
      description: 'Rice 10kg',
      quantity: 5,
      unit: 'kg',
      requestedCategory: null,
    }));
    expect(payload.items[0]).not.toHaveProperty('weightKg');
    expect(payload.items[0]).not.toHaveProperty('expiryDate');
  });

  it('maps Section 18A yes to donor consent without detailed tax fields', async () => {
    const fetch = vi.fn(okResponse);
    vi.stubGlobal('fetch', fetch);

    await createPendingDonation(draft({ donorConsentGiven: true }));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.donorConsentGiven).toBe(true);
    expect(payload.estimatedValueZar).toBe(100);
    expect(payload.donorContact).toBe('jane@example.com');
    expect(payload).not.toHaveProperty('donorTaxReference');
    expect(payload).not.toHaveProperty('donorAddress');
    expect(payload).not.toHaveProperty('donorIdNumber');
  });

  it('omits estimated value when Section 18A is no', async () => {
    const fetch = vi.fn(okResponse);
    vi.stubGlobal('fetch', fetch);

    await createPendingDonation(draft({ donorConsentGiven: false, estimatedValueZar: '100' }));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.donorConsentGiven).toBe(false);
    expect(payload).not.toHaveProperty('estimatedValueZar');
  });

  it('keeps unknown food products pending review', async () => {
    const fetch = vi.fn(okResponse);
    vi.stubGlobal('fetch', fetch);

    await createPendingDonation(draft({
      items: [{
        id: 'unknown',
        description: 'Mystery tin',
        quantity: '2',
        unit: 'each',
        productId: null,
        productLabel: '',
        unknownProduct: true,
      }],
    }));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.items[0]).toEqual(expect.objectContaining({
      productId: null,
      status: 'PENDING_PRODUCT_REVIEW',
      unknownProduct: true,
      requestedCategory: null,
    }));
  });

  it('maps Food No donations to non_food without creating products', async () => {
    const fetch = vi.fn(okResponse);
    vi.stubGlobal('fetch', fetch);

    await createPendingDonation(draft({
      isFood: false,
      items: [{
        id: 'blankets',
        description: 'Blankets',
        quantity: '4',
        unit: 'each',
        productId: null,
        productLabel: '',
        unknownProduct: false,
      }],
    }));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.donationCategory).toBe('non_food');
    expect(payload.items[0]).toEqual(expect.objectContaining({
      productId: null,
      requestedCategory: 'non_food',
      description: 'Blankets',
    }));
  });
});
