// ─────────────────────────────────────────────────────────────
// src/tests/GuestFarewell.test.jsx
//
// A guest who signs out is thanked by name and told we hope to see
// them again. The note is raised before the session ends, because the
// name goes with it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const navigate = vi.fn();
const toast = vi.fn();
const auth = { logout: vi.fn(async () => {}), user: { firstName: 'Serena Apollo', role: 'guest' } };

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../components/ui/toastContext', () => ({ useToast: () => toast }));
vi.mock('../services/guestSlipAPI', () => ({
  fetchMySlip: vi.fn(async () => { throw Object.assign(new Error('none'), { status: 404 }); }),
  releaseMySlip: vi.fn(async () => {}),
}));

const { useGuestSignOut } = await import('../features/guest/useGuestSignOut');

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { firstName: 'Serena Apollo', role: 'guest' };
});

describe('signing out as a guest', () => {
  it('thanks them by name and hopes to see them again', async () => {
    const { result } = renderHook(() => useGuestSignOut());
    await act(() => result.current.request());

    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      title: 'Thanks for joining us today, Serena Apollo',
      description: 'We hope to see you again soon.',
    }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it('still thanks them when there is no name to use', async () => {
    auth.user = { role: 'guest' };
    const { result } = renderHook(() => useGuestSignOut());
    await act(() => result.current.request());

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Thanks for joining us today' }));
  });
});
