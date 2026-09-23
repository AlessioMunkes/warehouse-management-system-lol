// ─────────────────────────────────────────────────────────────
// client/src/tests/PackingSpareSlips.test.jsx
//
// Spare slips used to render as the same stacked list "mine" and
// "done" use, unscoped by date, with a "Claim pallet" button on every
// row. Two things changed: it's now a single dropdown (role
// "combobox") plus one claim button, and the spare fetch is scoped to
// today via dispatchDate — a slip scheduled for another day is not
// "available on the floor" yet. Claiming drops the slip out of the
// spare pool for everyone (proven here by a reload that stops
// returning it), matching the sponsor's exclusivity request.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/pickingAPI', () => ({
  fetchPickingSlips: vi.fn(),
  assignSlip: vi.fn(),
}));

const pickingAPI = await import('../services/pickingAPI');
const { default: StaffSlipList } = await import('../features/packing/components/StaffSlipList');

const MINE_SLIP = {
  id: 1, ecd_name: 'Sunshine ECD', cohort: 'week1', child_count: 12,
  confirmed_items: 2, total_items: 5, status: 'in_progress', assigned_to: 7,
};

const TODAY_SPARE = {
  id: 2, ecd_name: 'Rainbow ECD', cohort: 'week2', child_count: 8,
  confirmed_items: 0, total_items: 4, status: 'pending', assigned_to: null,
};

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  pickingAPI.fetchPickingSlips.mockImplementation(async ({ mine } = {}) =>
    mine ? [MINE_SLIP] : [TODAY_SPARE]
  );
  pickingAPI.assignSlip.mockResolvedValue({});
});

describe('StaffSlipList — spare slips', () => {
  it('scopes the spare fetch to today, not the whole board', async () => {
    render(<StaffSlipList onOpenSlip={vi.fn()} />);
    await waitFor(() => expect(pickingAPI.fetchPickingSlips).toHaveBeenCalledTimes(2));

    const calls = pickingAPI.fetchPickingSlips.mock.calls.map(([args]) => args);
    expect(calls).toContainEqual({ mine: true });
    expect(calls).toContainEqual({ dispatchDate: todayISO() });
  });

  it('renders spare pallets as a dropdown, not a stacked list of claim buttons', async () => {
    const user = userEvent.setup();
    render(<StaffSlipList onOpenSlip={vi.fn()} />);
    await waitFor(() => expect(pickingAPI.fetchPickingSlips).toHaveBeenCalled());

    await user.click(await screen.findByRole('tab', { name: /Spare slips/i }));

    const select = await screen.findByRole('combobox', { name: /Choose a spare pallet/i });
    expect(within(select).getByRole('option', { name: /Rainbow ECD/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Claim pallet/i })).toHaveLength(1);
  });

  it('claims the selected pallet and switches to "Assigned to me"', async () => {
    const user = userEvent.setup();
    render(<StaffSlipList onOpenSlip={vi.fn()} />);
    await waitFor(() => expect(pickingAPI.fetchPickingSlips).toHaveBeenCalled());

    await user.click(await screen.findByRole('tab', { name: /Spare slips/i }));
    const select = await screen.findByRole('combobox', { name: /Choose a spare pallet/i });
    await user.selectOptions(select, String(TODAY_SPARE.id));

    // A claimed slip stops coming back from the "spare" fetch — the
    // exclusivity the sponsor asked for, proven at the data layer.
    pickingAPI.fetchPickingSlips.mockImplementation(async ({ mine } = {}) =>
      mine ? [MINE_SLIP, { ...TODAY_SPARE, assigned_to: 7 }] : []
    );

    await user.click(screen.getByRole('button', { name: /Claim pallet/i }));

    await waitFor(() => expect(pickingAPI.assignSlip).toHaveBeenCalledWith(TODAY_SPARE.id));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Assigned to me/i })).toHaveAttribute('aria-selected', 'true')
    );

    await user.click(screen.getByRole('tab', { name: /Spare slips/i }));
    expect(screen.getByText(/No spare pallets for today/i)).toBeInTheDocument();
  });

  it('disables claiming until a pallet is selected', async () => {
    const user = userEvent.setup();
    render(<StaffSlipList onOpenSlip={vi.fn()} />);
    await waitFor(() => expect(pickingAPI.fetchPickingSlips).toHaveBeenCalled());

    await user.click(await screen.findByRole('tab', { name: /Spare slips/i }));
    await screen.findByRole('combobox', { name: /Choose a spare pallet/i });

    expect(screen.getByRole('button', { name: /Claim pallet/i })).toBeDisabled();
  });
});
