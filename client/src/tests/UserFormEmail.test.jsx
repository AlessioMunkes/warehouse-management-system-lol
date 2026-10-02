import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserForm from '../features/users/components/UserForm';
import { toUser } from '../services/userAPI';

const initial = {
  id: 2, username: 'jdoe', firstName: 'Jane', lastName: 'Doe',
  email: 'jane@example.com', role: 'warehouse_worker', isActive: true,
};

const setup = (over = {}) => {
  const onSubmit = vi.fn();
  render(<UserForm initial={initial} onSubmit={onSubmit} {...over} />);
  return { onSubmit, user: userEvent.setup() };
};

describe('toUser', () => {
  it('maps email, with "" when the account has none', () => {
    expect(toUser({ id: 1, username: 'a', email: 'a@b.co' }).email).toBe('a@b.co');
    expect(toUser({ id: 1, username: 'a', email: null }).email).toBe('');
  });
});

describe('UserForm email', () => {
  it('shows the current email', () => {
    setup();
    expect(screen.getByLabelText('Email').value).toBe('jane@example.com');
  });

  it('does not send email when it is unchanged', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('email');
  });

  it('sends the trimmed new email when changed', async () => {
    const { onSubmit, user } = setup();
    const input = screen.getByLabelText('Email');
    await user.clear(input);
    await user.type(input, '  New@Example.com ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit.mock.calls[0][0].email).toBe('New@Example.com');
  });

  it('sends null when the email is cleared', async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText('Email'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit.mock.calls[0][0].email).toBeNull();
  });

  it('blocks an invalid email and says why', async () => {
    const { onSubmit, user } = setup();
    const input = screen.getByLabelText('Email');
    await user.clear(input);
    await user.type(input, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('That does not look like a valid email address.')).toBeTruthy();
  });

  it('shows a server error such as a duplicate', () => {
    setup({ error: 'Another account already uses the email "x@y.co".' });
    expect(screen.getByText(/already uses the email/)).toBeTruthy();
  });
});
