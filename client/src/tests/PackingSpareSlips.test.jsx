// ─────────────────────────────────────────────────────────────
// client/src/tests/PackingSpareSlips.test.jsx
//
// Spare slips are what "Assigned to floor" shows — the tab a worker
// lands on, ahead of their own "Claimed by me" — rendered as the same
// stacked list "mine" and "done" use, scoped to the floor window (this
// week and the next seven days — a slip is on the floor from the moment
// it is created), with a Claim button on every row instead of a badge.
// Claiming drops the slip out of the spare pool for everyone (proven
// here by a reload that stops returning it), matching the sponsor's
// exclusivity request.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/pickingAPI', () => ({
  fetchPickingSlips: vi.fn(),
  assignSlip: vi.fn(),
}));

const pickingAPI = await import('../services/pickingAPI');
const { default: StaffSlipList } = await import('../features/packing/components/StaffSlipList');

const MINE_SLIP = {
  id: 1, ecd_name: 'Sunshine ECD', cohort: 'tuesday', child_count: 12,
  confirmed_items: 2, total_items: 5, status: 'in_progress', assigned_to: 7,
};

const TODAY_SPARE = {
  id: 2, ecd_name: 'Rainbow ECD', cohort: 'thursday', child_count: 8,
  confirmed_items: 0, total_items: 4, status: 'pending', assigned_to: null,
};

const { floorWindow } = await import('../features/packing/spareSlips');

beforeEach(() => {
  vi.clearAllMocks();
  pickingAPI.fetchPickingSlips.mockImplementation(async ({ mine } = {}) =>
    mine ? [MINE_SLIP] : [TODAY_SPARE]
  );
  pickingAPI.assignSlip.mockResolvedValue({});
});

describe('StaffSlipList — spare slips', () => {
  it('scopes the spare fetch to the floor window, not the whole board', async () => {
    render(<StaffSlipList onOpenSlip={vi.fn()} />);
    await waitFor(() => expect(pickingAPI.fetchPickingSlips).toHaveBeenCalledTimes(2));

    const calls = pickingAPI.fetchPickingSlips.mock.calls.map(([args]) => args);
    expect(calls).toContainEqual({ mine: true });
    expect(calls).toContainEqual(floorWindow());
  });

  // A slip made on Monday for Tuesday has to be claimable on Monday.
  it('runs the floor window from this week\'s Monday through the next seven days', () => {
    // Wednesday 7 October 2026.
    expect(floorWindow(new Date(2026, 9, 7, 9, 0))).toEqual({ from: '2026-10-05', to: '2026-10-14' });
    // A Monday starts at itself; a Sunday still reaches back to its Monday.
    expect(floorWindow(new Date(2026, 9, 5)).from).toBe('2026-10-05');
    expect(floorWindow(new Date(2026, 9, 11)).from).toBe('2026-10-05');
  });

  it('opens on "Assigned to floor" with each spare pallet as its own row and a Claim button', async () => {
    render(<StaffSlipList onOpenSlip={vi.fn()} />);
    await waitFor(() => expect(pickingAPI.fetchPickingSlips).toHaveBeenCalled());

    expect(await screen.findByRole('tab', { name: /Assigned to floor/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/Rainbow ECD/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Claim$/i })).toBeInTheDocument();
  });

  it('claims a pallet and switches to "Claimed by me"', async () => {
    const user = userEvent.setup();
    render(<StaffSlipList onOpenSlip={vi.fn()} />);
    await waitFor(() => expect(pickingAPI.fetchPickingSlips).toHaveBeenCalled());
    await screen.findByText(/Rainbow ECD/i);

    // A claimed slip stops coming back from the "spare" fetch — the
    // exclusivity the sponsor asked for, proven at the data layer.
    pickingAPI.fetchPickingSlips.mockImplementation(async ({ mine } = {}) =>
      mine ? [MINE_SLIP, { ...TODAY_SPARE, assigned_to: 7 }] : []
    );

    await user.click(screen.getByRole('button', { name: /^Claim$/i }));

    await waitFor(() => expect(pickingAPI.assignSlip).toHaveBeenCalledWith(TODAY_SPARE.id));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Claimed by me/i })).toHaveAttribute('aria-selected', 'true')
    );

    await user.click(screen.getByRole('tab', { name: /Assigned to floor/i }));
    expect(screen.getByText(/Nothing on the floor right now/i)).toBeInTheDocument();
  });
});
