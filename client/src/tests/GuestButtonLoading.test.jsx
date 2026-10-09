import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../features/guest/GuestPrimitives';

describe('guest Button — loading state', () => {
  it('is disabled, aria-busy and shows a spinner while loading', () => {
    const onClick = vi.fn();
    const { container } = render(<Button loading onClick={onClick}>Sign out</Button>);
    const btn = screen.getByRole('button', { name: 'Sign out' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.gst-spinner')).not.toBeNull();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is a normal enabled button when not loading', () => {
    const { container } = render(<Button>Sign out</Button>);
    const btn = screen.getByRole('button', { name: 'Sign out' });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('.gst-spinner')).toBeNull();
  });

  it('stays disabled when disabled is passed without loading', () => {
    render(<Button disabled>Sign out</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
