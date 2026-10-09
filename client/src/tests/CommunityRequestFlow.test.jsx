import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({
  getRequests: vi.fn(), logRequest: vi.fn(), claimRequest: vi.fn(), confirmRequest: vi.fn(),
}));
vi.mock('../services/communityRequestAPI', () => ({ default: api }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, role: 'warehouse_worker' } }) }));

import CommunityRequestFlow from '../features/communityRequests/CommunityRequestFlow';

const item = (over = {}) => ({
  id: 1, productId: 5, productName: 'Rice', unit: 'kg', quantityApproved: 6, quantityReleased: 0, shortAt: null, ...over,
});

const approved = (over = {}) => ({
  id: 1, requestedAt: '2026-10-01T08:00:00.000Z', callerName: 'Thandi', callerContact: '021 555 0100',
  itemsRequested: 'Rice and beans', quantityNote: 'Collect Friday', outcome: 'approved', outcomeNote: '',
  handledBy: null, handledByName: null, assignedTo: null, assignedToName: null, itemsShortAt: null,
  items: [item(), item({ id: 2, productId: 6, productName: 'Beans', quantityApproved: 3 })], ...over,
});

const openToPack = async (user) => {
  await user.click(screen.getByRole('tab', { name: 'To pack' }));
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getRequests.mockResolvedValue([]);
});

describe('Log a request (worker)', () => {
  it('logs the request, says a manager approves it, and clears the form for the next call', async () => {
    api.logRequest.mockResolvedValue({});
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await user.type(screen.getByLabelText('What was requested'), 'Samp and oil');
    await user.click(screen.getByRole('button', { name: 'Log request' }));

    // The floor asks for it to be kept on the phone if there is no signal.
    await waitFor(() => expect(api.logRequest).toHaveBeenCalledWith(
      expect.objectContaining({ itemsRequested: 'Samp and oil' }), { keepOffline: true },
    ));
    expect(await screen.findByText('Request logged. A manager approves it before anyone packs.')).toBeTruthy();
    expect(screen.getByLabelText('What was requested').value).toBe('');
  });

  it('says the request is saved on the phone when there was no signal', async () => {
    api.logRequest.mockResolvedValue({ queued: true, label: 'A benevolent request' });
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await user.type(screen.getByLabelText('What was requested'), 'Samp and oil');
    await user.click(screen.getByRole('button', { name: 'Log request' }));

    expect(await screen.findByText(/saved on your phone/)).toBeTruthy();
    expect(screen.queryByText('Request logged. A manager approves it before anyone packs.')).toBeNull();
  });

  it('keeps the future-date block and the notes label', async () => {
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    expect(screen.getByLabelText('Quantity and collection notes')).toBeTruthy();
    await user.type(screen.getByLabelText('What was requested'), 'x');
    await user.type(screen.getByLabelText(/Date & time of request/), '2099-01-01T10:00');
    expect(screen.getByText('Choose a date and time that is not in the future.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Log request' }));
    expect(api.logRequest).not.toHaveBeenCalled();
  });

  it('tells you what to do on this screen, not what it is', async () => {
    render(<CommunityRequestFlow />);
    expect(screen.getByText('Log what the caller asks for. A manager approves it before anyone packs.')).toBeTruthy();
  });
});

describe('To pack', () => {
  it('asks only for approved requests, and leaves out ones that need new items', async () => {
    api.getRequests.mockResolvedValue([
      approved({ id: 1, callerName: 'Thandi' }),
      approved({ id: 2, callerName: 'Flagged Fiona', itemsShortAt: '2026-10-03T08:00:00Z' }),
    ]);
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openToPack(user);

    expect(await screen.findByText('Thandi')).toBeTruthy();
    expect(screen.queryByText('Flagged Fiona')).toBeNull();
    expect(api.getRequests).toHaveBeenCalledWith({ outcome: 'approved' });
  });

  it('shows what to pack for each request', async () => {
    api.getRequests.mockResolvedValue([approved()]);
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openToPack(user);
    expect(await screen.findByText('Rice · 6 kg, Beans · 3 kg')).toBeTruthy();
    expect(screen.getByText('Collect Friday')).toBeTruthy();
  });

  it('says nothing to pack when the list is empty', async () => {
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openToPack(user);
    expect(await screen.findByText('Nothing to pack right now.')).toBeTruthy();
  });

  it('tells you to claim a request, then confirm', async () => {
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openToPack(user);
    expect(await screen.findByText('Claim a request to pack it. Then confirm what went out.')).toBeTruthy();
  });

  describe('who can do what', () => {
    it('Claim on an unclaimed request; claiming it reloads the list', async () => {
      api.getRequests.mockResolvedValue([approved()]);
      api.claimRequest.mockResolvedValue({});
      const user = userEvent.setup();
      render(<CommunityRequestFlow />);
      await openToPack(user);
      await user.click(await screen.findByRole('button', { name: 'Claim' }));
      await waitFor(() => expect(api.claimRequest).toHaveBeenCalledWith(1));
      await waitFor(() => expect(api.getRequests.mock.calls.length).toBeGreaterThan(1));
    });

    it('a request claimed by someone else has no buttons and says who has it', async () => {
      api.getRequests.mockResolvedValue([approved({ handledBy: 4, handledByName: 'Ayesha K' })]);
      const user = userEvent.setup();
      render(<CommunityRequestFlow />);
      await openToPack(user);
      expect(await screen.findByText(/Claimed by Ayesha K/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Start packing' })).toBeNull();
    });

    it('one assigned to you says so and opens straight to packing, with no Claim', async () => {
      api.getRequests.mockResolvedValue([approved({ assignedTo: 7, assignedToName: 'Me' })]);
      const user = userEvent.setup();
      render(<CommunityRequestFlow />);
      await openToPack(user);
      expect(await screen.findByText(/Assigned to you/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start packing' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull();
    });

    it('one you claimed offers Start packing', async () => {
      api.getRequests.mockResolvedValue([approved({ handledBy: 7, handledByName: 'Me' })]);
      const user = userEvent.setup();
      render(<CommunityRequestFlow />);
      await openToPack(user);
      expect(await screen.findByText(/Claimed by you/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start packing' })).toBeTruthy();
    });

    it('one assigned to someone else can still be claimed, and says who it is assigned to', async () => {
      api.getRequests.mockResolvedValue([approved({ assignedTo: 4, assignedToName: 'Sipho M' })]);
      const user = userEvent.setup();
      render(<CommunityRequestFlow />);
      await openToPack(user);
      expect(await screen.findByText(/Assigned to Sipho M/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Claim' })).toBeTruthy();
    });

    it("shows the server's reason when someone else claimed it first, and refreshes", async () => {
      api.getRequests.mockResolvedValue([approved()]);
      api.claimRequest.mockRejectedValue(new Error('Someone has already claimed this request.'));
      const user = userEvent.setup();
      render(<CommunityRequestFlow />);
      await openToPack(user);
      await user.click(await screen.findByRole('button', { name: 'Claim' }));
      expect(await screen.findByText('Someone has already claimed this request.')).toBeTruthy();
      await waitFor(() => expect(api.getRequests.mock.calls.length).toBeGreaterThan(1));
    });
  });

  describe('packing', () => {
    const start = async (user, over = {}) => {
      api.getRequests.mockResolvedValue([approved({ handledBy: 7, handledByName: 'Me', ...over })]);
      render(<CommunityRequestFlow />);
      await openToPack(user);
      await user.click(await screen.findByRole('button', { name: 'Start packing' }));
    };

    it('shows what to fetch, with what went out already set to what was approved', async () => {
      const user = userEvent.setup();
      await start(user);
      expect(await screen.findByText('Fetch these items. Then confirm what went out.')).toBeTruthy();
      expect(screen.getByText('Rice · fetch 6 kg')).toBeTruthy();
      expect(screen.getByText('Beans · fetch 3 kg')).toBeTruthy();
      expect(screen.getByLabelText('Went out: Rice').value).toBe('6');
      expect(screen.getByLabelText('Went out: Beans').value).toBe('3');
    });

    it('confirming with everything sends every line and says fulfilled', async () => {
      api.confirmRequest.mockResolvedValue({ outcome: 'fulfilled' });
      const user = userEvent.setup();
      await start(user);
      await user.click(await screen.findByRole('button', { name: 'Confirm what went out' }));

      await waitFor(() => expect(api.confirmRequest).toHaveBeenCalledWith(1, [
        { productId: 5, quantityReleased: 6 }, { productId: 6, quantityReleased: 3 },
      ]));
      expect(await screen.findByText('Done. Marked fulfilled.')).toBeTruthy();
      // Back on the list.
      expect(screen.getByRole('heading', { name: 'To pack' })).toBeTruthy();
    });

    it('lowering a quantity sends the lower one and says partly fulfilled', async () => {
      api.confirmRequest.mockResolvedValue({ outcome: 'partially_fulfilled' });
      const user = userEvent.setup();
      await start(user);
      const rice = await screen.findByLabelText('Went out: Rice');
      await user.clear(rice);
      await user.type(rice, '4');
      await user.click(screen.getByRole('button', { name: 'Confirm what went out' }));

      await waitFor(() => expect(api.confirmRequest).toHaveBeenCalledWith(1, [
        { productId: 5, quantityReleased: 4 }, { productId: 6, quantityReleased: 3 },
      ]));
      expect(await screen.findByText('Done. Marked partly fulfilled, with what went out.')).toBeTruthy();
    });

    it('cannot go above what was approved', async () => {
      const user = userEvent.setup();
      await start(user);
      const rice = await screen.findByLabelText('Went out: Rice');
      await user.clear(rice);
      await user.type(rice, '7');
      expect(screen.getByText('No more than 6 kg.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Confirm what went out' }).disabled).toBe(true);
    });

    it('cannot be empty or negative', async () => {
      const user = userEvent.setup();
      await start(user);
      const rice = await screen.findByLabelText('Went out: Rice');
      await user.clear(rice);
      expect(screen.getByRole('button', { name: 'Confirm what went out' }).disabled).toBe(true);
      await user.type(rice, '-1');
      expect(screen.getAllByText('Enter how many went out, zero or more.').length).toBeGreaterThan(0);
    });

    it('nothing out at all is not a fulfilment: it points to a manager', async () => {
      const user = userEvent.setup();
      await start(user);
      for (const label of ['Went out: Rice', 'Went out: Beans']) {
        const input = await screen.findByLabelText(label);
        await user.clear(input);
        await user.type(input, '0');
      }
      expect(screen.getByText('Nothing went out. Ask a manager to decline the request instead.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Confirm what went out' }).disabled).toBe(true);
      expect(api.confirmRequest).not.toHaveBeenCalled();
    });

    it("shows the server's refusal and stays on the pack screen", async () => {
      api.confirmRequest.mockRejectedValue(new Error('This request needs new items before it can be packed.'));
      const user = userEvent.setup();
      await start(user);
      await user.click(await screen.findByRole('button', { name: 'Confirm what went out' }));
      expect(await screen.findByText('This request needs new items before it can be packed.')).toBeTruthy();
      expect(screen.getByLabelText('Went out: Rice')).toBeTruthy();
    });

    it('Back to the list leaves without confirming anything', async () => {
      const user = userEvent.setup();
      await start(user);
      await user.click(await screen.findByRole('button', { name: 'Back to the list' }));
      expect(await screen.findByRole('button', { name: 'Start packing' })).toBeTruthy();
      expect(api.confirmRequest).not.toHaveBeenCalled();
    });

    it('has no two buttons with the same label', async () => {
      const user = userEvent.setup();
      await start(user);
      await screen.findByText('Fetch these items. Then confirm what went out.');
      const labels = screen.getAllByRole('button').map((b) => b.textContent.trim());
      expect(new Set(labels).size).toBe(labels.length);
    });
  });

  it('workers can no longer resolve a request directly: there is no Resolve button', async () => {
    api.getRequests.mockResolvedValue([approved({ handledBy: 7 })]);
    const user = userEvent.setup();
    render(<CommunityRequestFlow />);
    await openToPack(user);
    await screen.findByText('Thandi');
    expect(screen.queryByRole('button', { name: /Resolve/ })).toBeNull();
    void within;
  });
});
