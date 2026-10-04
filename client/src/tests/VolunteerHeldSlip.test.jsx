// ─────────────────────────────────────────────────────────────
// client/src/tests/VolunteerHeldSlip.test.jsx
//
// A guest volunteer holds a pallet through assigned_volunteer_id, never
// assigned_to. Without a label of its own the pallet read as unassigned,
// and a worker was offered "Claim this pallet" on one a volunteer was
// packing.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { packers, volunteerHolder } from '../features/pickingSlips/slipViews';

vi.mock('../services/pickingAPI', () => ({
  fetchPickingSlip: vi.fn(),
  assignSlip: vi.fn(),
  confirmItem: vi.fn(),
  flagItem: vi.fn(),
  completeSlip: vi.fn(),
}));

const api = await import('../services/pickingAPI');
const { default: StaffSlipFlow } = await import('../features/packing/components/StaffSlipFlow');

const GUEST_HELD = {
  id: 5, ecd_name: 'Sunshine ECD', cohort: 'tuesday', child_count: 12, status: 'in_progress',
  assigned_to: null, packer_name: null, assigned_volunteer_id: '7', volunteer_name: 'Thandi', items: [],
};

beforeEach(() => vi.clearAllMocks());

describe('the volunteer holder label', () => {
  it('names the volunteer in the packer column text', () => {
    expect(volunteerHolder(GUEST_HELD)).toBe('Volunteer: Thandi');
    expect(packers(GUEST_HELD)).toBe('Volunteer: Thandi');
  });

  it('says just "Volunteer" when the name is missing', () => {
    expect(volunteerHolder({ assigned_volunteer_id: '7', volunteer_name: null })).toBe('Volunteer');
  });

  it('is empty when no volunteer holds it, and sits beside the staff packers', () => {
    expect(volunteerHolder({ assigned_volunteer_id: null })).toBe('');
    expect(packers({ packer_name: 'Mo', assigned_volunteer_id: null })).toBe('Mo');
    expect(packers({ packer_name: 'Mo', assigned_volunteer_id: '7', volunteer_name: 'Thandi' }))
      .toBe('Mo & Volunteer: Thandi');
  });
});

describe('a worker opening a pallet a volunteer is packing', () => {
  it('sees who has it and is not offered a claim', async () => {
    api.fetchPickingSlip.mockResolvedValue(GUEST_HELD);
    render(<StaffSlipFlow currentUser={{ id: 3, role: 'warehouse_worker' }} slipId={5} onBack={vi.fn()} onFinished={vi.fn()} />);
    expect(await screen.findByText('Volunteer: Thandi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim this pallet/ })).not.toBeInTheDocument();
  });

  it('is still offered a claim on a pallet nobody holds', async () => {
    api.fetchPickingSlip.mockResolvedValue({ ...GUEST_HELD, status: 'pending', assigned_volunteer_id: null, volunteer_name: null });
    render(<StaffSlipFlow currentUser={{ id: 3, role: 'warehouse_worker' }} slipId={5} onBack={vi.fn()} onFinished={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /Claim this pallet/ })).toBeInTheDocument();
  });
});
