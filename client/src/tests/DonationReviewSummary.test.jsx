import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DonationDraftContext, emptyDraft } from '../features/donation/context/DonationDraftContext';
import { DonationDetailsPage } from '../pages/DonationDetailsPage';
import { EditSectionDialog, ReviewSummary } from '../features/donation/components/ReviewSummary';

const baseDraft = () => ({
  ...emptyDraft(),
  category: 'recipe_food',
  items: [{
    id: 'item-1',
    description: 'Rice',
    quantity: '5',
    unit: 'kg',
    productId: null,
    productLabel: '',
    requestedCategory: '',
  }],
  estimatedValueZar: '120',
  programmeCode: 'NOC',
  donorConsentGiven: false,
});

function ReviewHarness() {
  const [draft, setDraft] = React.useState(baseDraft());
  const [open, setOpen] = React.useState(true);

  return (
    <>
      <ReviewSummary draft={draft} />
      <EditSectionDialog
        open={open}
        onOpenChange={setOpen}
        sections={[]}
        draft={draft}
        updateDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      />
      <button type="button" onClick={() => setOpen(true)}>Open editor</button>
    </>
  );
}

describe('Donation review summary edit flow', () => {
  it('does not show donation category in the review summary', () => {
    render(<ReviewHarness />);

    expect(screen.queryByText('Category')).not.toBeInTheDocument();
    expect(screen.queryByText('Recipe food')).not.toBeInTheDocument();
  });

  it('does not expose category edit controls in the correction dialog', async () => {
    const user = userEvent.setup();
    render(<ReviewHarness />);

    expect(screen.queryByRole('radio', { name: /^Recipe Food/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^Non-food/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Donation details cancel flow', () => {
  it('resets the draft when cancelling the details form', async () => {
    const user = userEvent.setup();
    const resetDraft = vi.fn();

    render(
      <MemoryRouter>
        <DonationDraftContext.Provider value={{
          draft: baseDraft(),
          updateDraft: vi.fn(),
          resetDraft,
          emptyItem: vi.fn(),
        }}>
          <DonationDetailsPage />
        </DonationDraftContext.Provider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(resetDraft).toHaveBeenCalledTimes(1);
  });
});
