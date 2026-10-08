// ─────────────────────────────────────────────────────────────
// client/src/tests/StaffSlipRelease.test.jsx
//
// The packer's "Release this pallet": there while a claim is theirs and
// nothing on it is packed, gone once the first item is confirmed or
// flagged.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/pickingAPI', () => ({
  fetchPickingSlip: vi.fn(),
  assignSlip: vi.fn(),
  releaseSlip: vi.fn(),
  confirmItem: vi.fn(),
  flagItem: vi.fn(),
  completeSlip: vi.fn(),
}));

const pickingAPI = await import('../services/pickingAPI');
const { default: StaffSlipFlow } = await import('../features/packing/components/StaffSlipFlow');

const ME = { id: 7, role: 'warehouse_worker' };
const item = (id, status) => ({ id, product_name: `Product ${id}`, required_quantity: 2, unit: 'kg', status, packed_quantity: status === 'pending' ? null : 2 });
const slip = (over = {}) => ({
  id: 12, ecd_name: 'Green Pastures', cohort: 'tuesday', child_count: 30, status: 'in_progress',
  assigned_to: ME.id, packer_name: 'Worker One', items: [item(1, 'pending'), item(2, 'pending')], ...over,
});
const show = async (data, props = {}) => {
  pickingAPI.fetchPickingSlip.mockResolvedValue(data);
  render(<StaffSlipFlow currentUser={ME} slipId={12} onBack={vi.fn()} {...props} />);
  await screen.findByText('Green Pastures');
};
const releaseButton = () => screen.queryByRole('button', { name: 'Release this pallet' });

beforeEach(() => { vi.clearAllMocks(); });

describe('Release this pallet', () => {
  it('is offered on a pallet I claimed and have not started', async () => {
    await show(slip());
    expect(releaseButton()).toBeTruthy();
  });

  it('falls away once an item is confirmed or flagged', async () => {
    await show(slip({ items: [item(1, 'confirmed'), item(2, 'pending')] }));
    expect(releaseButton()).toBeNull();
  });

  it('is not offered on a spare pallet or one someone else holds', async () => {
    await show(slip({ assigned_to: null, status: 'pending', packer_name: null }));
    expect(releaseButton()).toBeNull();
  });

  it('is not offered on another packer\'s pallet', async () => {
    await show(slip({ assigned_to: 99, packer_name: 'Someone Else' }));
    expect(releaseButton()).toBeNull();
  });

  it('releases the pallet and goes back to the list', async () => {
    const onBack = vi.fn();
    pickingAPI.releaseSlip.mockResolvedValue({});
    await show(slip(), { onBack });
    fireEvent.click(releaseButton());
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(pickingAPI.releaseSlip).toHaveBeenCalledWith(12);
  });

  it('stays on the pallet and says why when the server refuses', async () => {
    const onBack = vi.fn();
    pickingAPI.releaseSlip.mockRejectedValue(new Error('You have started packing this pallet. Ask a manager to release it.'));
    await show(slip(), { onBack });
    fireEvent.click(releaseButton());
    expect(await screen.findByText('You have started packing this pallet. Ask a manager to release it.')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });
});
