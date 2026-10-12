// ─────────────────────────────────────────────────────────────
// src/tests/LoadingScreen.test.jsx
//
// The app-wide loading screen. It must come up when someone is waiting
// on a request they caused, stay away for quick loads and for requests
// that fire on a timer, and never take a tap.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beginLoad, tracked, markIntent, isWaiting, resetLoading } from '../services/loading';
import LoadingScreen, { GlobalLoading } from '../components/ui/loading-screen';

beforeEach(() => { vi.useFakeTimers(); resetLoading(); });
afterEach(() => { vi.useRealTimers(); });

const tick = (ms) => act(() => { vi.advanceTimersByTime(ms); });

describe('which requests count as someone waiting', () => {
  it('counts a request that starts just after an action', () => {
    markIntent();
    const done = beginLoad();
    expect(isWaiting()).toBe(true);
    done();
    expect(isWaiting()).toBe(false);
  });

  it('does not count a request nobody caused', () => {
    beginLoad();
    expect(isWaiting()).toBe(false);
    markIntent();
    vi.advanceTimersByTime(3000);
    beginLoad();
    expect(isWaiting()).toBe(false);
  });

  it('counts a request that starts while another is going, or straight after it', () => {
    markIntent();
    const first = beginLoad();
    vi.advanceTimersByTime(5000);
    const second = beginLoad();
    first();
    expect(isWaiting()).toBe(true);
    second();
    vi.advanceTimersByTime(300);
    const third = beginLoad();
    expect(isWaiting()).toBe(true);
    third();
  });

  it('leaves out a caller that asks to stay quiet', () => {
    markIntent();
    beginLoad({ quiet: true });
    expect(isWaiting()).toBe(false);
  });

  it('stops waiting when the request fails, and only once', async () => {
    markIntent();
    await expect(tracked(async () => { throw new Error('down'); })).rejects.toThrow('down');
    expect(isWaiting()).toBe(false);
    const done = beginLoad();
    const other = beginLoad();
    done();
    done();
    expect(isWaiting()).toBe(true);
    other();
  });
});

describe('the loading screen', () => {
  const show = () => render(<MemoryRouter><GlobalLoading /></MemoryRouter>);

  it('shows nothing for a quick load', () => {
    show();
    let done;
    act(() => { markIntent(); done = beginLoad(); });
    tick(300);
    act(() => done());
    tick(1000);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('comes up when a load is slow, and goes when it ends', () => {
    show();
    let done;
    act(() => { markIntent(); done = beginLoad(); });
    tick(450);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    tick(2000);
    act(() => done());
    tick(50);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays long enough to be read once it has appeared', () => {
    show();
    let done;
    act(() => { markIntent(); done = beginLoad(); });
    tick(410);
    act(() => done());
    tick(200);
    expect(screen.getByRole('status')).toBeInTheDocument();
    tick(400);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays away for a request on a timer', () => {
    show();
    tick(5000);
    act(() => { beginLoad(); });
    tick(2000);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('never takes a tap, and can carry its own words', () => {
    render(<LoadingScreen solid label="Checking your session" />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Checking your session');
    expect(el.className).toContain('pointer-events-none');
  });
});
