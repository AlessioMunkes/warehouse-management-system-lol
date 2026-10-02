import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ getRequests: vi.fn(), resolveRequest: vi.fn() }));

vi.mock('../services/communityRequestAPI', () => ({
  default: api,
  OUTCOME_LABELS: { fulfilled: 'Fulfilled', partially_fulfilled: 'Partially fulfilled', declined: 'Declined' },
  RESOLVE_OUTCOMES: ['fulfilled', 'partially_fulfilled', 'declined'],
}));

import CommunityRequestFlow from '../features/communityRequests/components/CommunityRequestFlow';

const pending = {
  id: 4, requestedAt: '2026-10-01T08:00:00.000Z', callerName: 'Thandi', callerContact: '',
  itemsRequested: 'Samp', quantityNote: '', outcome: 'pending', handledBy: null, handledByName: null,
};

const openResolveForm = async (user) => {
  await user.click(screen.getByRole('tab', { name: 'Open requests' }));
  await user.click(await screen.findByRole('button', { name: 'Resolve' }));
};

describe('worker resolve form: stock-out flag', () => {
  beforeEach(() => {
    api.getRequests.mockReset().mockResolvedValue([pending]);
    api.resolveRequest.mockReset().mockResolvedValue({});
  });

  it('appends the tag on a new line when ticked', async () => {
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openResolveForm(user);

    await user.type(screen.getByLabelText('Note'), 'Gave two bags');
    await user.click(screen.getByLabelText('Stock went out — a manager needs to record it'));
    await user.click(screen.getByRole('button', { name: 'Save outcome' }));

    expect(api.resolveRequest).toHaveBeenCalledWith(4, {
      outcome: 'fulfilled',
      outcomeNote: 'Gave two bags\n[Stock out — manager to record]',
    });
  });

  it('sends the note unchanged when the box is left unticked', async () => {
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openResolveForm(user);

    await user.type(screen.getByLabelText('Note'), 'Gave two bags');
    await user.click(screen.getByRole('button', { name: 'Save outcome' }));

    expect(api.resolveRequest).toHaveBeenCalledWith(4, { outcome: 'fulfilled', outcomeNote: 'Gave two bags' });
  });

  it('hides the box for a declined outcome and never tags it', async () => {
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openResolveForm(user);

    await user.click(screen.getByLabelText('Stock went out — a manager needs to record it'));
    await user.click(screen.getByRole('radio', { name: 'Declined' }));
    expect(screen.queryByLabelText('Stock went out — a manager needs to record it')).toBeNull();

    await user.type(screen.getByLabelText('Note'), 'None left');
    await user.click(screen.getByRole('button', { name: 'Save outcome' }));
    expect(api.resolveRequest).toHaveBeenCalledWith(4, { outcome: 'declined', outcomeNote: 'None left' });
  });
});
