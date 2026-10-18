// ─────────────────────────────────────────────────────────────
// src/tests/ErrorBoundary.test.jsx
//
// A screen that cannot be drawn must say so and offer a way out, not
// leave a blank page. Both ways a screen fails are covered: an error
// while rendering, and its file failing to arrive.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lazy, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../components/ui/error-boundary';

const Broken = () => { throw new Error('Cannot read properties of undefined'); };

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('a screen that cannot be drawn', () => {
  it('shows what it holds when nothing goes wrong', () => {
    render(<ErrorBoundary><p>the screen</p></ErrorBoundary>);
    expect(screen.getByText('the screen')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so, with the reason, when the screen throws', () => {
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This screen could not be opened');
    expect(alert).toHaveTextContent('Details: Cannot read properties of undefined');
  });

  it('says so when the screen\'s own file fails to arrive', async () => {
    const Missing = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
    render(<ErrorBoundary><Suspense fallback={<p>loading</p>}><Missing /></Suspense></ErrorBoundary>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch dynamically imported module');
  });

  it('leaves everything outside it standing', () => {
    render(<div><nav>the menu</nav><ErrorBoundary><Broken /></ErrorBoundary></div>);
    expect(screen.getByText('the menu')).toBeInTheDocument();
  });

  it('reloads the page when asked', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
