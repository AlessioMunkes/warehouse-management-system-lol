// ─────────────────────────────────────────────────────────────
// client/src/tests/ResetPasswordPage.test.jsx
//
// Same shape as Section18AFormPage.test.jsx: mock the API module,
// mount the real page under a MemoryRouter at its real route, and
// drive it through the DOM. passwordResetAPI.resolveReset/confirmReset
// are the only things mocked — everything else (the four terminal
// states, the password-match validation, the redirect on success) is
// exercised for real.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import passwordResetAPI from '../services/passwordResetAPI';

vi.mock('../services/passwordResetAPI', () => ({
  default: { resolveReset: vi.fn(), confirmReset: vi.fn() },
}));

const withStatus = (status, message, reason) =>
  Object.assign(new Error(message), { status, ...(reason ? { reason } : {}) });

const renderPage = (token = 'sometoken') => render(
  <MemoryRouter initialEntries={[`/reset-password/${token}`]}>
    <Routes>
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/login" element={<div>LOGIN PAGE</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  passwordResetAPI.resolveReset.mockResolvedValue({ valid: true });
  passwordResetAPI.confirmReset.mockResolvedValue({ success: true });
});

describe('ResetPasswordPage — terminal states', () => {
  it('shows the password form for a valid token', async () => {
    renderPage();
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument();
  });

  it('shows the expired-link screen with a way back in', async () => {
    passwordResetAPI.resolveReset.mockRejectedValue(withStatus(410, 'expired', 'expired'));
    renderPage();
    expect(await screen.findByText('This reset link has expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to login' })).toBeInTheDocument();
  });

  it('shows the used-link screen', async () => {
    passwordResetAPI.resolveReset.mockRejectedValue(withStatus(410, 'used', 'used'));
    renderPage();
    expect(await screen.findByText('This reset link has already been used')).toBeInTheDocument();
  });

  it('shows the superseded-link screen', async () => {
    passwordResetAPI.resolveReset.mockRejectedValue(withStatus(410, 'superseded', 'superseded'));
    renderPage();
    expect(await screen.findByText('A newer reset link was sent')).toBeInTheDocument();
  });

  it('falls back to the not-found screen for a reason-less error (bad token, or a 500)', async () => {
    passwordResetAPI.resolveReset.mockRejectedValue(withStatus(404, 'not found'));
    renderPage();
    expect(await screen.findByText("This reset link doesn't work")).toBeInTheDocument();
  });

  it('"Request a new link" sends the visitor to the login page with the modal flagged open', async () => {
    passwordResetAPI.resolveReset.mockRejectedValue(withStatus(404, 'not found'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Request a new link' }));
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });
});

describe('ResetPasswordPage — setting a new password', () => {
  const fillAndSubmit = async (password, confirm) => {
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  };

  it('blocks submit on a password under 8 characters', async () => {
    renderPage();
    await fillAndSubmit('short', 'short');
    // Two elements mention "8 characters" — the always-visible hint and
    // this FieldError — so match the FieldError's own exact wording.
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(passwordResetAPI.confirmReset).not.toHaveBeenCalled();
  });

  it('blocks submit when the two passwords do not match', async () => {
    renderPage();
    await fillAndSubmit('longenough1', 'longenough2');
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(passwordResetAPI.confirmReset).not.toHaveBeenCalled();
  });

  it('confirms and redirects to login on a valid matching password', async () => {
    renderPage();
    await fillAndSubmit('longenough1', 'longenough1');
    await waitFor(() => expect(passwordResetAPI.confirmReset).toHaveBeenCalledWith('sometoken', 'longenough1'));
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('shows the matching terminal screen if the link was used/expired between resolve and submit', async () => {
    passwordResetAPI.confirmReset.mockRejectedValue(withStatus(410, 'used', 'used'));
    renderPage();
    await fillAndSubmit('longenough1', 'longenough1');
    expect(await screen.findByText('This reset link has already been used')).toBeInTheDocument();
  });

  it('shows an inline error for an unshaped failure, without redirecting', async () => {
    passwordResetAPI.confirmReset.mockRejectedValue(new Error('Could not reset your password. Please try again.'));
    renderPage();
    await fillAndSubmit('longenough1', 'longenough1');
    expect(await screen.findByText('Could not reset your password. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });
});
