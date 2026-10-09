// ─────────────────────────────────────────────────────────────
// client/src/tests/FloorFeedback.test.jsx
//
// Two things the floor's shell does for a worker with their hands full:
// the button they pressed flashes, and the screen stays on in a task.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import usePressFlash, { PRESSED_CLASS } from '../features/staff/usePressFlash';
import useKeepAwake from '../features/staff/useKeepAwake';

function Floor({ flash = true }) {
  usePressFlash(flash);
  return (
    <>
      <div className="stf-shell">
        <button type="button">Confirm</button>
        <button type="button">Flag</button>
        <button type="button" disabled>Log pallet packed</button>
        <button type="button"><span>Start counting</span></button>
      </div>
      <button type="button">Outside the floor</button>
    </>
  );
}

describe('usePressFlash', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('flashes the button that was pressed, and only that one', () => {
    render(<Floor />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(screen.getByText('Confirm').classList.contains(PRESSED_CLASS)).toBe(true);
    expect(screen.getByText('Flag').classList.contains(PRESSED_CLASS)).toBe(false);
  });

  it('stops after a moment', () => {
    render(<Floor />);
    fireEvent.click(screen.getByText('Confirm'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('Confirm').classList.contains(PRESSED_CLASS)).toBe(false);
  });

  it('flashes the button when the press lands on something inside it', () => {
    render(<Floor />);
    fireEvent.click(screen.getByText('Start counting'));
    expect(screen.getByText('Start counting').closest('button').classList.contains(PRESSED_CLASS)).toBe(true);
  });

  it('leaves a disabled button and anything outside the floor alone', () => {
    render(<Floor />);
    fireEvent.click(screen.getByText('Log pallet packed'));
    fireEvent.click(screen.getByText('Outside the floor'));
    expect(screen.getByText('Log pallet packed').classList.contains(PRESSED_CLASS)).toBe(false);
    expect(screen.getByText('Outside the floor').classList.contains(PRESSED_CLASS)).toBe(false);
  });

  it('does nothing when switched off', () => {
    render(<Floor flash={false} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(screen.getByText('Confirm').classList.contains(PRESSED_CLASS)).toBe(false);
  });
});

function Task({ active }) {
  useKeepAwake(active);
  return <p>task</p>;
}

describe('useKeepAwake', () => {
  let release;
  let request;
  beforeEach(() => {
    release = vi.fn().mockResolvedValue(undefined);
    request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  });
  afterEach(() => { delete navigator.wakeLock; });

  it('asks the device to stay awake in a task, and lets go on leaving', async () => {
    const { unmount } = render(<Task active />);
    await act(async () => {});
    expect(request).toHaveBeenCalledWith('screen');
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('asks again when the page comes back, since the device let go while it was hidden', async () => {
    render(<Task active />);
    await act(async () => {});
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not ask outside a task', async () => {
    render(<Task active={false} />);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
  });

  it('carries on when the device refuses or has no such thing', async () => {
    request.mockRejectedValue(new Error('NotAllowedError'));
    expect(() => render(<Task active />)).not.toThrow();
    await act(async () => {});
    delete navigator.wakeLock;
    expect(() => render(<Task active />)).not.toThrow();
  });
});
