// ─────────────────────────────────────────────────────────────
// client/src/tests/ButtonDoubleClick.test.jsx
//
// Every Button guards itself against a double click: an async action
// runs once, and a form is submitted once, but someone fixing what the
// form refused can send it again at once.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('runs an async action once however often it is pressed while it runs', async () => {
    let finish;
    const onClick = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => { finish(); });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('leaves an ordinary button alone', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Add one</Button>);
    const button = screen.getByRole('button', { name: 'Add one' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('submits a form once on a double click', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<form onSubmit={onSubmit}><input aria-label="Name" /><Button type="submit">Send</Button></form>);
    const button = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('lets a corrected form be sent again straight away', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<form onSubmit={onSubmit}><input aria-label="Name" /><Button type="submit">Send</Button></form>);
    const button = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(button);
    fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Thandi' } });
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
