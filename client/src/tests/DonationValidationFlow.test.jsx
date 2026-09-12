import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DonationDraftContext, emptyDraft } from '../features/donation/context/DonationDraftContext';
import { DonationDetailsPage } from '../pages/DonationDetailsPage';
import { ReviewPage } from '../pages/ReviewPage';

vi.mock('../services/donationAPI', () => ({
  createPendingDonation: vi.fn(),
}));

const { createPendingDonation } = await import('../services/donationAPI');

const validDraft = () => ({
  ...emptyDraft(),
  category: 'recipe_food',
  items: [{
    id: 'line-1',
    description: 'Rice',
    quantity: '10',
    unit: 'kg',
    productId: 12,
    productLabel: 'Rice',
    requestedCategory: '',
  }],
  estimatedValueZar: '250',
  donorConsentGiven: false,
});

function LocationProbe({ onChange }) {
  const location = useLocation();
  React.useEffect(() => onChange(location), [location, onChange]);
  return null;
}

function renderDonationFlow({ draft = validDraft(), updateDraft = vi.fn(), resetDraft = vi.fn(), onLocation = vi.fn() } = {}) {
  return {
    updateDraft,
    resetDraft,
    onLocation,
    ...render(
      <MemoryRouter initialEntries={['/donations/new/review']}>
        <DonationDraftContext.Provider value={{
          draft,
          updateDraft,
          resetDraft,
          emptyItem: vi.fn(),
        }}>
          <LocationProbe onChange={onLocation} />
          <Routes>
            <Route path="/donations/new" element={<DonationDetailsPage />} />
            <Route path="/donations/new/review" element={<ReviewPage />} />
          </Routes>
        </DonationDraftContext.Provider>
      </MemoryRouter>
    ),
  };
}

describe('Donation backend validation UX', () => {
  it('maps backend field errors onto visible fields without clearing entered values', async () => {
    const user = userEvent.setup();
    const onLocation = vi.fn();
    createPendingDonation.mockRejectedValueOnce(Object.assign(new Error('Please fix the highlighted fields.'), {
      errors: {
        donationCategory: 'A donation category is required.',
        estimatedValueZar: 'Estimated value must be 0 or greater.',
        donorContact: 'Enter a valid email address.',
        'items.0.quantity': 'Quantity must be greater than zero.',
      },
    }));

    renderDonationFlow({ onLocation });

    await user.click(screen.getByRole('button', { name: /Yes, submit/i }));

    expect(await screen.findByText('A donation category is required.')).toBeInTheDocument();
    expect(screen.getByText('Estimated value must be 0 or greater.')).toBeInTheDocument();
    expect(screen.getByText('Quantity must be greater than zero.')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Rice').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('250')).toBeInTheDocument();

    await waitFor(() => expect(onLocation).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/donations/new' })
    ));
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Recipe FoodMatches/i })).toHaveFocus());
  });
});

describe('Donation completion navigation', () => {
  it('sends Go to Taskboard to the staff taskboard after a successful donation', async () => {
    const user = userEvent.setup();
    const onLocation = vi.fn();
    const resetDraft = vi.fn();
    createPendingDonation.mockResolvedValueOnce({
      id: 44,
      status: 'committed',
      items: [{ id: 1, status: 'committed' }],
    });

    renderDonationFlow({ onLocation, resetDraft });

    await user.click(screen.getByRole('button', { name: /Yes, submit/i }));
    await user.click(await screen.findByRole('button', { name: /Go to Taskboard/i }));

    expect(resetDraft).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onLocation).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/noc' })
    ));
  });
});
