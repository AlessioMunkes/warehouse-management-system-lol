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
        sections={['category']}
        draft={draft}
        updateDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      />
      <button type="button" onClick={() => setOpen(true)}>Open editor</button>
    </>
  );
}

describe('Donation review summary edit flow', () => {
  it('updates the summary only after saving a category edit', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewHarness />);

    const summaryCategory = () => container.querySelector('.stf-row-meta')?.textContent;
    expect(summaryCategory()).toBe('Recipe food');

    await user.click(screen.getByRole('radio', { name: /^Non-foodStored/i }));
    expect(summaryCategory()).toBe('Recipe food');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(summaryCategory()).toBe('Non-food');
  });

  it('discards unsaved category edits on cancel', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewHarness />);
    const summaryCategory = () => container.querySelector('.stf-row-meta')?.textContent;

    await user.click(screen.getByRole('radio', { name: /^Non-foodStored/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(summaryCategory()).toBe('Recipe food');

    await user.click(screen.getByRole('button', { name: 'Open editor' }));
    expect(screen.getByRole('radio', { name: /^Recipe FoodMatches/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^Non-foodStored/i })).toHaveAttribute('aria-checked', 'false');
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
