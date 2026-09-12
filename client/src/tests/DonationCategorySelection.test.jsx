import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategorySelector } from '../features/donation/components/CategorySelector';
import { DonationItemsList } from '../features/donation/components/DonationItemsList';
import { createPendingDonation } from '../services/donationAPI';

const draft = (category) => ({
  category,
  donorName: '',
  donorContact: '',
  donorTaxReference: '',
  donorConsentGiven: false,
  estimatedValueZar: '100',
  notes: '',
  idempotencyKey: 'idem-1',
  items: [
    {
      id: 'unmatched',
      description: 'Rice',
      quantity: '5',
      unit: 'kg',
      productId: null,
      productLabel: '',
    },
    {
      id: 'matched',
      description: 'Beans',
      quantity: '2',
      unit: 'kg',
      productId: 7,
      productLabel: 'Beans',
    },
  ],
});

const okResponse = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ success: true, data: { id: 1 } }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Donation category selection', () => {
  it('shows Manager Review as a top-level routing option', () => {
    render(<CategorySelector value="" onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /^Recipe FoodMatches/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Add-on foodSplit/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Non-recipe FoodRouted/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Non-foodStored/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Manager ReviewRequires/i })).toBeInTheDocument();
  });

  it('does not render per-item category selection', () => {
    render(<DonationItemsList items={draft('recipe_food').items} onChange={vi.fn()} />);

    expect(screen.getAllByText('Match to stock item (optional)').length).toBeGreaterThan(0);
    expect(screen.queryByText(/What kind of item is this/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Leave blank for manager review/i)).not.toBeInTheDocument();
  });

  it('uses the top category for unmatched pending items', async () => {
    const fetch = vi.fn(okResponse);
    vi.stubGlobal('fetch', fetch);

    await createPendingDonation(draft('non_recipe_food'));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.donationCategory).toBe('non_recipe_food');
    expect(payload.items[0].requestedCategory).toBe('non_recipe_food');
    expect(payload.items[1].requestedCategory).toBeNull();
  });

  it('sends Manager Review through the pending classification path', async () => {
    const fetch = vi.fn(okResponse);
    vi.stubGlobal('fetch', fetch);

    await createPendingDonation(draft('manager_review'));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.donationCategory).toBeNull();
    expect(payload.items[0].requestedCategory).toBeNull();
    expect(payload.items[1].requestedCategory).toBeNull();
  });
});
