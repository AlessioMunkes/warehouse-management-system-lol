// ─────────────────────────────────────────────────────────────
// client/src/tests/PackingFlagPhoto.test.jsx
//
// Flagging a packed item needs a photo. Asked for from the floor: the
// manager sorts a flag out from the picture, so "Flag item" stays off
// until one is saved against the item, and says why.
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
vi.mock('../services/photoAPI', () => ({
  shrinkPhoto: vi.fn(),
  uploadPhoto: vi.fn(),
  listPhotos: vi.fn(),
}));

const pickingAPI = await import('../services/pickingAPI');
const photoAPI = await import('../services/photoAPI');
const { default: StaffSlipFlow } = await import('../features/packing/StaffSlipFlow');

const ME = { id: 7, role: 'warehouse_worker' };
const SLIP = {
  id: 12, ecd_name: 'Green Pastures', cohort: 'tuesday', child_count: 30, status: 'in_progress',
  assigned_to: ME.id, packer_name: 'Worker One',
  items: [{ id: 1, product_name: 'Oats', required_quantity: 2, unit: 'kg', status: 'pending', packed_quantity: null }],
};

const openFlag = async () => {
  pickingAPI.fetchPickingSlip.mockResolvedValue(SLIP);
  render(<StaffSlipFlow currentUser={ME} slipId={12} onBack={vi.fn()} />);
  await screen.findByText('Green Pastures');
  fireEvent.click(await screen.findByRole('button', { name: 'Flag' }));
  fireEvent.click(screen.getByText('Short quantity'));
};
const flagButton = () => screen.getByRole('button', { name: 'Flag item' });

beforeEach(() => { vi.clearAllMocks(); });

describe('flagging a packed item', () => {
  it('cannot be sent without a photo, and says so', async () => {
    await openFlag();
    expect(flagButton()).toBeDisabled();
    expect(screen.getByText('Add a photo of the item before you flag it.')).toBeTruthy();
  });

  it('can be sent once a photo is saved against the item', async () => {
    photoAPI.shrinkPhoto.mockResolvedValue('data:image/jpeg;base64,AAAA');
    photoAPI.uploadPhoto.mockResolvedValue({ id: 5 });
    pickingAPI.flagItem.mockResolvedValue({});
    await openFlag();

    const file = new File(['x'], 'damage.jpg', { type: 'image/jpeg' });
    fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } });
    await waitFor(() => expect(flagButton()).not.toBeDisabled());
    expect(photoAPI.uploadPhoto).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'picking_slip_item', entityId: 1 }));
    expect(screen.queryByText('Add a photo of the item before you flag it.')).toBeNull();

    fireEvent.click(flagButton());
    await waitFor(() => expect(pickingAPI.flagItem).toHaveBeenCalledWith(12, 1, 'Short quantity', undefined, ''));
  });

  // Saved on the phone with no signal still counts: it sends itself later.
  it('counts a photo waiting on the phone', async () => {
    photoAPI.shrinkPhoto.mockResolvedValue('data:image/jpeg;base64,AAAA');
    photoAPI.uploadPhoto.mockResolvedValue({ queued: true });
    await openFlag();

    const file = new File(['x'], 'damage.jpg', { type: 'image/jpeg' });
    fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } });
    await waitFor(() => expect(flagButton()).not.toBeDisabled());
  });
});
