// ─────────────────────────────────────────────────────────────
// src/tests/WorkingChrome.test.jsx
//
// useWorkingChrome.js: on a phone the bars around a floor task step
// back while the worker is working (scrolled down, or typing in a
// field) and come back on scrolling up, at the top, or on a new screen.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useWorkingChrome from '../features/staff/useWorkingChrome';

function Harness({ pathname = '/noc/procurement' }) {
  const ref = useRef(null);
  const working = useWorkingChrome(ref, pathname);
  return (
    <main data-testid="scroller">
      <div ref={ref}>
        <p>{working ? 'working' : 'resting'}</p>
        <input aria-label="Count" />
        <button type="button">Tick</button>
      </div>
    </main>
  );
}

const scrollTo = (y) => {
  const el = screen.getByTestId('scroller');
  el.scrollTop = y;
  fireEvent.scroll(el);
};

// The hook ignores scrolling for a moment after the bars change (the
// page's own height change moves the scroll). Tests move the clock on.
let now = 1_000_000;
const later = (ms = 1000) => { now += ms; };
beforeEach(() => { vi.spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-stf-working');
});

describe('the bars around a floor task, on a phone', () => {
  it('step back when the worker scrolls down, and come back on scrolling up', () => {
    render(<Harness />);
    expect(screen.getByText('resting')).toBeInTheDocument();

    scrollTo(120);
    expect(screen.getByText('working')).toBeInTheDocument();
    expect(document.documentElement.hasAttribute('data-stf-working')).toBe(true);

    later();
    scrollTo(80);
    expect(screen.getByText('resting')).toBeInTheDocument();
    expect(document.documentElement.hasAttribute('data-stf-working')).toBe(false);
  });

  // Hiding the bars changes the page height and the browser moves the
  // scroll to match; that must not bring them straight back.
  it('do not flicker back from the scroll their own hiding causes', () => {
    render(<Harness />);
    scrollTo(120);
    scrollTo(60);
    expect(screen.getByText('working')).toBeInTheDocument();
  });

  it('ignore a small wobble, and always come back at the top', () => {
    render(<Harness />);
    scrollTo(120);
    later();
    scrollTo(116);
    expect(screen.getByText('working')).toBeInTheDocument();
    later();
    scrollTo(10);
    expect(screen.getByText('resting')).toBeInTheDocument();
  });

  it('stay away just below the top while the worker carries on down, and come back at the very top', () => {
    render(<Harness />);
    scrollTo(120);
    scrollTo(20);       // the header folding away carried the page up
    expect(screen.getByText('working')).toBeInTheDocument();
    later();
    scrollTo(40);       // the worker carries on down from just below the top
    expect(screen.getByText('working')).toBeInTheDocument();
    later();
    scrollTo(1);
    expect(screen.getByText('resting')).toBeInTheDocument();
  });

  it('come back on pulling down at the top, where the page cannot scroll', () => {
    render(<Harness />);
    scrollTo(120);
    // The header folding away carried the page to the top, inside the pause.
    scrollTo(0);
    const el = screen.getByTestId('scroller');
    later();
    act(() => { screen.getByLabelText('Count').focus(); });
    expect(screen.getByText('working')).toBeInTheDocument();
    fireEvent.wheel(el, { deltaY: -40 });
    expect(screen.getByText('resting')).toBeInTheDocument();

    act(() => { screen.getByLabelText('Count').focus(); });
    fireEvent.touchStart(el, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(el, { touches: [{ clientY: 160 }] });
    expect(screen.getByText('resting')).toBeInTheDocument();
  });

  it('step back while a field is being typed in, and come back after it on a short screen', async () => {
    render(<Harness />);
    act(() => { screen.getByLabelText('Count').focus(); });
    expect(screen.getByText('working')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: 'Tick' }).focus();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByText('resting')).toBeInTheDocument();
  });

  it('come back on a new screen', () => {
    const { rerender } = render(<Harness pathname="/noc/procurement" />);
    scrollTo(120);
    expect(screen.getByText('working')).toBeInTheDocument();
    rerender(<Harness pathname="/noc/packing" />);
    expect(screen.getByText('resting')).toBeInTheDocument();
  });
});
