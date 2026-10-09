// ─────────────────────────────────────────────────────────────
// client/src/tests/LoginPageForgotPassword.test.jsx
//
// Scoped to the forgot-password modal only — the login form itself
// (username/password/redirect-by-role) has no existing test file to
// extend, and is out of scope for this change. useAuth and
// react-router-dom are mocked the same way DispatchWiring.test.jsx
// mocks them for a page with several router lib.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { requestReset } from '../services/passwordResetAPI';

vi.mock('../services/passwordResetAPI', () => ({
  requestReset: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

const mockSearchParams = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
  useSearchParams: () => [mockSearchParams],
}));

const { default: LoginPage } = await import('../pages/LoginPage');

const GENERIC_MESSAGE = "If that email is registered, we've sent a reset link.";

const openModal = () => fireEvent.click(screen.getByRole('button', { name: 'FORGOT PASSWORD?' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage — forgot password', () => {
  it('opens the request form, not the old "contact your manager" copy', () => {
    render(<LoginPage />);
    openModal();
    // "FORGOT PASSWORD?" matches both the trigger button (still in the
    // DOM, just inert behind the dialog) and the dialog's own title —
    // the title is the one that proves the dialog actually opened.
    expect(screen.getByText("Enter your email and we'll send you a link to reset your password.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SEND RESET LINK' })).toBeInTheDocument();
    expect(screen.queryByText(/contact your.*manager.*or.*administrator/i)).not.toBeInTheDocument();
  });

  it('keeps the "no email on your account" footnote under the form', () => {
    render(<LoginPage />);
    openModal();
    expect(screen.getByText('No email on your account? Contact your manager.')).toBeInTheDocument();
  });

  it('shows the identical generic message for a known or unknown email alike', async () => {
    requestReset.mockResolvedValue({ message: GENERIC_MESSAGE });
    render(<LoginPage />);
    openModal();
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'SEND RESET LINK' }));

    expect(await screen.findByText(GENERIC_MESSAGE)).toBeInTheDocument();
  });

  it('shows the rate-limit message on a 429, without claiming the email was sent', async () => {
    requestReset.mockRejectedValue(Object.assign(new Error('Too many requests.'), { status: 429 }));
    render(<LoginPage />);
    openModal();
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'SEND RESET LINK' }));

    // Rendered as "⚠ Too many requests..." — match on the message text
    // regardless of the leading glyph.
    expect(await screen.findByText((text) => text.includes('Too many requests, try again in a few minutes.')))
      .toBeInTheDocument();
    expect(screen.queryByText(GENERIC_MESSAGE)).not.toBeInTheDocument();
  });

  it('still shows the generic message for an unexpected server error — never a distinguishing one', async () => {
    requestReset.mockRejectedValue(new Error('boom'));
    render(<LoginPage />);
    openModal();
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'SEND RESET LINK' }));

    expect(await screen.findByText(GENERIC_MESSAGE)).toBeInTheDocument();
  });

  it('resets to the request form when reopened after a previous send', async () => {
    requestReset.mockResolvedValue({ message: GENERIC_MESSAGE });
    render(<LoginPage />);
    openModal();
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'SEND RESET LINK' }));
    await screen.findByText(GENERIC_MESSAGE);

    fireEvent.click(screen.getByRole('button', { name: 'GOT IT' }));
    openModal();

    expect(screen.getByRole('button', { name: 'SEND RESET LINK' })).toBeInTheDocument();
    expect(screen.getByLabelText('EMAIL')).toHaveValue('');
  });
});
