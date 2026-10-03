import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getRequests: vi.fn(), logRequest: vi.fn(), approveRequest: vi.fn(), declineRequest: vi.fn(),
  assignRequest: vi.fn(), rechooseItems: vi.fn(),
}));
vi.mock('../services/communityRequestAPI', () => ({ default: api }));

const stock = vi.hoisted(() => ({ getManifest: vi.fn() }));
vi.mock('../services/stockAPI', () => stock);

const picking = vi.hoisted(() => ({ fetchAssignableWorkers: vi.fn() }));
vi.mock('../services/pickingAPI', () => picking);

import CommunityRequestsPage from '../pages/CommunityRequestsPage';

const renderPage = (url = '/community-requests') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/community-requests" element={<CommunityRequestsPage />} />
    </Routes>
  </MemoryRouter>,
);

const row = (over = {}) => ({
  id: 1, requestedAt: '2026-10-01T08:00:00.000Z', callerName: 'Thandi', callerContact: '',
  itemsRequested: 'Samp', quantityNote: '', outcome: 'pending', outcomeNote: '',
  handledBy: null, handledByName: null, resolvedAt: null,
  approvedAt: null, approvedBy: null, approvedByName: null,
  assignedTo: null, assignedToName: null, itemsShortAt: null, items: [], ...over,
});

const item = (over = {}) => ({
  id: 1, productId: 5, productName: 'Rice', unit: 'kg', quantityApproved: 6, quantityReleased: 0, shortAt: null, ...over,
});

const PRODUCTS = [
  { id: 5, name: 'Rice', sku: 'RICE-1', unit: 'kg', available: 10 },
  { id: 6, name: 'Beans', sku: 'BEAN-1', unit: 'kg', available: 3 },
];

describe('CommunityRequestsPage (manager)', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    stock.getManifest.mockReset().mockResolvedValue(PRODUCTS);
    picking.fetchAssignableWorkers.mockReset().mockResolvedValue([
      { id: 11, first_name: 'Ayesha', last_name: 'K' }, { id: 12, first_name: 'Sipho', last_name: 'M' },
    ]);
    // jsdom has no scrollIntoView; opening a panel can call it.
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('the list', () => {
    it('opens on Awaiting approval, with a count on every tab', async () => {
      api.getRequests.mockResolvedValue([
        row({ id: 1 }),
        row({ id: 2, outcome: 'approved', itemsRequested: 'Oil', items: [item()] }),
        row({ id: 3, outcome: 'approved', itemsShortAt: '2026-10-03T08:00:00Z', items: [item({ shortAt: 'x' })] }),
        row({ id: 4, outcome: 'fulfilled' }),
        row({ id: 5, outcome: 'declined' }),
      ]);
      renderPage();
      expect(await screen.findByText('Samp')).toBeTruthy();

      const tab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
      expect(tab('Awaiting approval').textContent).toMatch(/1/);
      expect(tab('Approved').textContent).toMatch(/1/);
      expect(tab('Needs new items').textContent).toMatch(/1/);
      expect(tab('Fulfilled').textContent).toMatch(/1/);
      expect(tab('Declined').textContent).toMatch(/1/);
      expect(tab('All').textContent).toMatch(/5/);
    });

    it('?status=needs-items opens the Needs new items tab, oldest flagged first', async () => {
      api.getRequests.mockResolvedValue([
        row({ id: 1, itemsRequested: 'Newer', outcome: 'approved', itemsShortAt: '2026-10-03T10:00:00Z', items: [item({ shortAt: 'x' })] }),
        row({ id: 2, itemsRequested: 'Older', outcome: 'approved', itemsShortAt: '2026-10-03T08:00:00Z', items: [item({ id: 2, shortAt: 'x' })] }),
      ]);
      renderPage('/community-requests?status=needs-items');
      await screen.findByText('Older');
      const text = document.body.textContent;
      expect(text.indexOf('Older')).toBeLessThan(text.indexOf('Newer'));
    });

    it('shows the error when a load fails, and Try again recovers', async () => {
      api.getRequests.mockRejectedValueOnce(new Error('Boom'));
      api.getRequests.mockResolvedValue([row()]);
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByText('Boom')).toBeTruthy();

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(screen.getByText('Samp')).toBeTruthy());
      expect(screen.queryByText('Boom')).toBeNull();
    });

    it('labels the claimer or assigned packer on an approved row, and the handler on a resolved one', async () => {
      api.getRequests.mockResolvedValue([
        row({ id: 1, outcome: 'approved', handledBy: 5, handledByName: 'Ayesha K', items: [item()] }),
        row({ id: 2, outcome: 'approved', assignedTo: 6, assignedToName: 'Sipho M', itemsRequested: 'Oil', items: [item({ id: 2 })] }),
        row({ id: 3, itemsRequested: 'Beans', outcome: 'fulfilled', handledBy: 7, handledByName: 'Mia D', resolvedAt: '2026-10-01T10:00:00.000Z' }),
      ]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=all');
      expect(await screen.findByText('Claimed by Ayesha K')).toBeTruthy();
      expect(screen.getByText('Assigned to Sipho M')).toBeTruthy();
      expect(screen.getByText('Handled by Mia D')).toBeTruthy();
      void user;
    });

    it('lists the chosen items under what was asked for', async () => {
      api.getRequests.mockResolvedValue([
        row({ outcome: 'approved', items: [item(), item({ id: 2, productId: 6, productName: 'Beans', quantityApproved: 2 })] }),
      ]);
      renderPage('/community-requests?status=approved');
      const list = await screen.findByRole('list', { name: 'Items chosen' });
      expect(within(list).getByText('Rice · 6 kg')).toBeTruthy();
      expect(within(list).getByText('Beans · 2 kg')).toBeTruthy();
    });

    it('keeps the actions in a sticky column so they stay visible at laptop widths', async () => {
      api.getRequests.mockResolvedValue([row()]);
      renderPage();
      const button = await screen.findByRole('button', { name: 'Approve and choose items' });
      expect(button.closest('td').className).toContain('sticky');
    });

    it('labels the notes column "Quantity and collection notes"', async () => {
      api.getRequests.mockResolvedValue([row({ quantityNote: 'Collecting Monday' })]);
      renderPage();
      expect(await screen.findByText('Quantity and collection notes')).toBeTruthy();
      expect(screen.getByText('Collecting Monday')).toBeTruthy();
    });

    it('offers each stage the next step, and nothing on a closed request', async () => {
      api.getRequests.mockResolvedValue([
        row({ id: 1, itemsRequested: 'A' }),
        row({ id: 2, itemsRequested: 'B', outcome: 'approved', items: [item()] }),
        row({ id: 3, itemsRequested: 'C', outcome: 'approved', itemsShortAt: '2026-10-03T08:00:00Z', items: [item({ id: 2, shortAt: 'x' })] }),
        row({ id: 4, itemsRequested: 'D', outcome: 'fulfilled', resolvedAt: '2026-10-02T08:00:00Z' }),
      ]);
      renderPage('/community-requests?status=all');
      await screen.findByText('A');
      const rowOf = (text) => screen.getByText(text).closest('tr');
      const buttons = (text) => within(rowOf(text).querySelector('td:last-child')).queryAllByRole('button').map((b) => b.textContent);

      expect(buttons('A')).toEqual(['Approve and choose items']);
      expect(buttons('B')).toEqual(expect.arrayContaining(['Assign packer', 'Decline']));
      expect(buttons('C')).toEqual(expect.arrayContaining(['Choose other items', 'Decline']));
      expect(buttons('C')).not.toContain('Assign packer');
      expect(within(rowOf('D')).queryByRole('button', { name: /Approve|Decline|Assign|Choose/ })).toBeNull();
    });

    it('a flagged row says when and which product ran short', async () => {
      const flaggedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      api.getRequests.mockResolvedValue([
        row({ outcome: 'approved', itemsShortAt: flaggedAt, items: [item({ shortAt: flaggedAt }), item({ id: 2, productId: 6, productName: 'Beans' })] }),
      ]);
      renderPage('/community-requests?status=needs-items');
      expect(await screen.findByText(/Needs new items · flagged 2h ago/)).toBeTruthy();
      expect(screen.getByText(/Rice ran short/)).toBeTruthy();
    });
  });

  describe('Approve and choose items', () => {
    const openPanel = async (user, over = {}) => {
      api.getRequests.mockResolvedValue([row({ itemsRequested: 'Samp and beans for 40', quantityNote: 'Collect Friday', callerContact: '021 555', ...over })]);
      renderPage();
      await user.click(await screen.findByRole('button', { name: 'Approve and choose items' }));
      return screen.findByText('What they asked for');
    };
    const addProduct = async (user, name) => {
      await user.click(screen.getByRole('button', { name: 'Add a product' }));
      await user.click(await screen.findByRole('button', { name: new RegExp(name) }));
    };

    it('shows what the caller asked for, and approve stays off until items are chosen', async () => {
      const user = userEvent.setup();
      await openPanel(user);
      expect(screen.getAllByText('Samp and beans for 40').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Collect Friday').length).toBeGreaterThan(0);
      expect(screen.getByText('No products chosen yet.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Approve' }).disabled).toBe(true);
    });

    it('picks products from the stock list with the available amount beside each', async () => {
      const user = userEvent.setup();
      await openPanel(user);
      await user.click(screen.getByRole('button', { name: 'Add a product' }));
      expect(await screen.findByText('10 kg available')).toBeTruthy();
      expect(screen.getByText('3 kg available')).toBeTruthy();
    });

    it('approves with the chosen products and quantities, then reloads', async () => {
      api.approveRequest.mockResolvedValue({});
      const user = userEvent.setup();
      await openPanel(user);
      await addProduct(user, 'Rice');
      await addProduct(user, 'Beans');
      await user.type(screen.getByLabelText('Quantity of Rice'), '6');
      await user.type(screen.getByLabelText('Quantity of Beans'), '2');
      await user.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => expect(api.approveRequest).toHaveBeenCalledWith(1, [
        { productId: 5, quantity: 6 }, { productId: 6, quantity: 2 },
      ]));
      await waitFor(() => expect(api.getRequests.mock.calls.length).toBeGreaterThan(1));
    });

    it('does not let a product be added twice', async () => {
      const user = userEvent.setup();
      await openPanel(user);
      await addProduct(user, 'Rice');
      await user.click(screen.getByRole('button', { name: 'Add a product' }));
      expect(await screen.findByRole('button', { name: /Beans/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Rice.*available/ })).toBeNull();
    });

    it('blocks a quantity above what is available, with a clear message', async () => {
      const user = userEvent.setup();
      await openPanel(user);
      await addProduct(user, 'Beans');
      await user.type(screen.getByLabelText('Quantity of Beans'), '5');
      expect(screen.getByRole('alert').textContent).toBe('Only 3 kg available.');
      expect(screen.getByRole('button', { name: 'Approve' }).disabled).toBe(true);
      expect(api.approveRequest).not.toHaveBeenCalled();
    });

    it('blocks zero or an empty quantity', async () => {
      const user = userEvent.setup();
      await openPanel(user);
      await addProduct(user, 'Rice');
      expect(screen.getByRole('button', { name: 'Approve' }).disabled).toBe(true);
      await user.type(screen.getByLabelText('Quantity of Rice'), '0');
      expect(screen.getByRole('button', { name: 'Approve' }).disabled).toBe(true);
    });

    it('a product can be removed again', async () => {
      const user = userEvent.setup();
      await openPanel(user);
      await addProduct(user, 'Rice');
      await user.click(screen.getByRole('button', { name: 'Remove Rice' }));
      expect(screen.getByText('No products chosen yet.')).toBeTruthy();
    });

    it("shows the server's refusal in the panel and keeps what was chosen", async () => {
      api.approveRequest.mockRejectedValue(new Error('Not enough stock to set aside: Rice (4 kg available, 6 kg asked for).'));
      const user = userEvent.setup();
      await openPanel(user);
      await addProduct(user, 'Rice');
      await user.type(screen.getByLabelText('Quantity of Rice'), '6');
      await user.click(screen.getByRole('button', { name: 'Approve' }));
      expect(await screen.findByText(/Not enough stock to set aside/)).toBeTruthy();
      expect(screen.getByLabelText('Quantity of Rice').value).toBe('6');
    });
  });

  describe('Decline', () => {
    it('from the approve panel asks for a reason, then declines with it', async () => {
      api.declineRequest.mockResolvedValue({});
      api.getRequests.mockResolvedValue([row()]);
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: 'Approve and choose items' }));
      await user.click(await screen.findByRole('button', { name: 'Decline' }));

      await user.click(await screen.findByRole('button', { name: 'Decline request' }));
      expect(await screen.findByText('Say why the request is declined.')).toBeTruthy();
      expect(api.declineRequest).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText('Reason'), 'Outside our area');
      await user.click(screen.getByRole('button', { name: 'Decline request' }));
      await waitFor(() => expect(api.declineRequest).toHaveBeenCalledWith(1, 'Outside our area'));
    });

    it('on an approved row says the stock set aside will be released', async () => {
      api.getRequests.mockResolvedValue([row({ outcome: 'approved', items: [item()] })]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=approved');
      await user.click(await screen.findByRole('button', { name: 'Decline' }));
      expect(await screen.findByText('The stock set aside for this request will be released.')).toBeTruthy();
    });
  });

  describe('Assign packer', () => {
    it('lists the packers and assigns the one chosen', async () => {
      api.assignRequest.mockResolvedValue({});
      api.getRequests.mockResolvedValue([row({ outcome: 'approved', items: [item()] })]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=approved');
      await user.click(await screen.findByRole('button', { name: 'Assign packer' }));

      await user.click(await screen.findByRole('combobox', { name: 'Packer' }));
      expect(await screen.findByRole('option', { name: 'Ayesha K' })).toBeTruthy();
      await user.click(screen.getByRole('option', { name: 'Sipho M' }));
      await user.click(screen.getByRole('button', { name: 'Assign packer' }));

      await waitFor(() => expect(api.assignRequest).toHaveBeenCalledWith(1, 12));
    });
  });

  describe('Choose other items (needs new items)', () => {
    const flaggedAt = '2026-10-03T08:00:00Z';
    const flagged = () => row({
      outcome: 'approved', itemsShortAt: flaggedAt,
      items: [
        item({ id: 1, productId: 5, productName: 'Rice', quantityApproved: 6, shortAt: flaggedAt }),
        item({ id: 2, productId: 6, productName: 'Beans', quantityApproved: 2 }),
      ],
    });

    it('starts from the lines that are still fine and explains what happened', async () => {
      api.getRequests.mockResolvedValue([flagged()]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=needs-items');
      await user.click(await screen.findByRole('button', { name: 'Choose other items' }));

      expect(await screen.findByText(/Pallet packing used the stock set aside for Rice/)).toBeTruthy();
      expect(screen.getByLabelText('Quantity of Beans').value).toBe('2');
      expect(screen.queryByLabelText('Quantity of Rice')).toBeNull();
    });

    it("counts the request's own approved lines as available to it", async () => {
      api.getRequests.mockResolvedValue([flagged()]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=needs-items');
      await user.click(await screen.findByRole('button', { name: 'Choose other items' }));
      // Beans: 3 available in stock + the 2 this request already holds.
      expect(await screen.findByText('5 kg available')).toBeTruthy();
    });

    it('saves the new items with the change-items call, not approve', async () => {
      api.rechooseItems.mockResolvedValue({});
      api.getRequests.mockResolvedValue([flagged()]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=needs-items');
      await user.click(await screen.findByRole('button', { name: 'Choose other items' }));
      await user.click(await screen.findByRole('button', { name: 'Add a product' }));
      await user.click(await screen.findByRole('button', { name: /Rice/ }));
      await user.type(screen.getByLabelText('Quantity of Rice'), '4');
      await user.click(screen.getByRole('button', { name: 'Save new items' }));

      await waitFor(() => expect(api.rechooseItems).toHaveBeenCalledWith(1, [
        { productId: 6, quantity: 2 }, { productId: 5, quantity: 4 },
      ]));
      expect(api.approveRequest).not.toHaveBeenCalled();
    });

    it('can still be declined', async () => {
      api.getRequests.mockResolvedValue([flagged()]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=needs-items');
      await user.click(await screen.findByRole('button', { name: 'Decline' }));
      expect(await screen.findByRole('button', { name: 'Decline request' })).toBeTruthy();
    });
  });

  describe('Details', () => {
    it('shows approved against what went out once confirmed', async () => {
      api.getRequests.mockResolvedValue([row({
        outcome: 'partially_fulfilled', resolvedAt: '2026-10-02T09:00:00Z', outcomeNote: '',
        approvedAt: '2026-10-02T07:00:00Z', approvedByName: 'Mia Day', handledByName: 'Ayesha K',
        items: [item({ quantityApproved: 6, quantityReleased: 4 })],
      })]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=fulfilled');
      await user.click(await screen.findByRole('button', { name: 'Thandi' }));

      const table = await screen.findByRole('table', { name: '' }).catch(() => null);
      const panel = screen.getByText('Benevolent request #1').closest('[role="dialog"]');
      expect(within(panel).getAllByText('Approved').length).toBeGreaterThan(0);
      expect(within(panel).getByText('Went out')).toBeTruthy();
      expect(within(panel).getByText('6 kg')).toBeTruthy();
      expect(within(panel).getByText('4 kg')).toBeTruthy();
      expect(within(panel).getByText(/Mia Day/)).toBeTruthy();
      void table;
    });

    it('shows a dash for what went out before anything is confirmed', async () => {
      api.getRequests.mockResolvedValue([row({ outcome: 'approved', items: [item()] })]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=approved');
      await user.click(await screen.findByRole('button', { name: 'Thandi' }));
      const panel = (await screen.findByText('Benevolent request #1')).closest('[role="dialog"]');
      expect(within(panel).getByText('6 kg')).toBeTruthy();
      expect(within(panel).queryByText('0 kg')).toBeNull();
    });

    it('an older request shows its free text and notes, with no items table', async () => {
      api.getRequests.mockResolvedValue([row({
        outcome: 'fulfilled', resolvedAt: '2026-09-01T09:00:00Z', outcomeNote: 'Gave two bags',
        itemsRequested: 'Samp', quantityNote: 'For 80 plates',
      })]);
      const user = userEvent.setup();
      renderPage('/community-requests?status=fulfilled');
      await user.click(await screen.findByRole('button', { name: 'Thandi' }));
      const panel = (await screen.findByText('Benevolent request #1')).closest('[role="dialog"]');
      expect(within(panel).getByText('For 80 plates')).toBeTruthy();
      expect(within(panel).getByText('Gave two bags')).toBeTruthy();
      expect(within(panel).queryByText('Went out')).toBeNull();
    });
  });
});
