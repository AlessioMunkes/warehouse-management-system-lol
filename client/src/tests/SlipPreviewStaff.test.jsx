// ─────────────────────────────────────────────────────────────
// client/src/tests/SlipPreviewStaff.test.jsx
//
// A signed-in worker, manager or admin who opens a pallet link must not
// start the volunteer flow: that would replace their staff session with a
// guest one. They are sent to their own screen for that pallet, and
// nothing is claimed.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../services/guestSlipAPI', () => ({
  fetchSlipPreview: vi.fn(),
  claimSlipByToken: vi.fn(),
  releaseMySlip: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const api = await import('../services/guestSlipAPI');
const { useAuth } = await import('../context/AuthContext');
const SlipPreviewPage = (await import('../pages/SlipPreviewPage')).default;

const preview = {
  id: 21, beneficiaryName: 'Tiny Tots ECD', beneficiaryKind: 'ecd',
  dispatchDate: '2026-10-15', itemCount: 2, status: 'pending', isClaimed: false,
};

const Where = ({ label }) => {
  const { pathname, search } = useLocation();
  return <div>{`${label}:${pathname}${search}`}</div>;
};

const renderScan = () => render(
  <MemoryRouter initialEntries={['/slip/abc']}>
    <Routes>
      <Route path="/slip/:token" element={<SlipPreviewPage />} />
      <Route path="/noc/packing/:slipId" element={<Where label="worker" />} />
      <Route path="/noc/picking-slips" element={<Where label="manager" />} />
      <Route path="/admin" element={<Where label="admin-home" />} />
      <Route path="/manager" element={<Where label="manager-home" />} />
    </Routes>
  </MemoryRouter>,
);

const signedIn = (role, extra = {}) => useAuth.mockReturnValue({
  user: { id: 4, role, firstName: 'Sam' }, isLoading: false, logout: vi.fn(), refreshFromClaim: vi.fn(), ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSlipPreview.mockResolvedValue(preview);
});

describe('/slip/:token as signed-in staff', () => {
  it('sends a worker to the packing screen for that slip', async () => {
    signedIn('warehouse_worker');
    renderScan();
    expect(await screen.findByText('worker:/noc/packing/21')).toBeInTheDocument();
  });

  it('sends a manager to Picking slips, opened on that slip', async () => {
    signedIn('manager');
    renderScan();
    expect(await screen.findByText('manager:/noc/picking-slips?open=21')).toBeInTheDocument();
  });

  it.each(['warehouse_worker', 'manager', 'admin'])('never starts the volunteer flow for %s', async (role) => {
    const refreshFromClaim = vi.fn();
    signedIn(role, { refreshFromClaim });
    renderScan();

    await screen.findByText(/./);
    await vi.waitFor(() => expect(api.fetchSlipPreview).toHaveBeenCalledWith('abc'));
    expect(screen.queryByRole('button', { name: /pack this one/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/what should we call you/i)).not.toBeInTheDocument();
    expect(api.claimSlipByToken).not.toHaveBeenCalled();
    expect(refreshFromClaim).not.toHaveBeenCalled();
  });

  it('tells an admin plainly, with a way home, rather than leaving them on a dead page', async () => {
    signedIn('admin');
    renderScan();

    expect(await screen.findByText(/admins do not pack pallets/i)).toBeInTheDocument();
    screen.getByRole('button', { name: /back to my home/i }).click();
    expect(await screen.findByText('admin-home:/admin')).toBeInTheDocument();
  });

  it('shows the server’s message when the link matches no pallet', async () => {
    signedIn('warehouse_worker');
    api.fetchSlipPreview.mockRejectedValue(new Error('That code did not match a pallet. Check the code, or ask a staff member.'));
    renderScan();

    expect(await screen.findByText(/did not match a pallet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to my home/i })).toBeInTheDocument();
  });

  it('shows nothing of the volunteer flow while the session is still being checked', () => {
    useAuth.mockReturnValue({ user: null, isLoading: true, logout: vi.fn(), refreshFromClaim: vi.fn() });
    renderScan();

    expect(api.fetchSlipPreview).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /pack this one/i })).not.toBeInTheDocument();
  });
});

describe('/slip/:token for a volunteer is unchanged', () => {
  it('still shows the pallet to a guest and to someone with no session', async () => {
    for (const user of [null, { id: '9', role: 'guest', firstName: 'Thabo' }]) {
      useAuth.mockReturnValue({ user, isLoading: false, logout: vi.fn(), refreshFromClaim: vi.fn() });
      const { unmount } = renderScan();
      expect(await screen.findByText('Tiny Tots ECD')).toBeInTheDocument();
      unmount();
    }
  });
});
