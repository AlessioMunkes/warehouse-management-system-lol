// ─────────────────────────────────────────────────────────────
// server/__tests__/expiryWarning.job.test.js
//
// Tests the setInterval-based scheduler itself, not the sweep logic
// (that's expiryWarning.service.test.js). Proves: runs once on start,
// only once per calendar day even across many ticks, retries the
// same day after a failure instead of waiting until tomorrow, and
// start/stop are idempotent.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const runExpiryCheckMock = vi.fn();
vi.mock('../src/services/expiryWarning.service.js', () => ({
  default: { runExpiryCheck: (...args) => runExpiryCheckMock(...args) },
}));

const { default: expiryWarningJob } = await import('../src/jobs/expiryWarning.job.js');

const ONE_HOUR_MS = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T08:00:00Z'));
  runExpiryCheckMock.mockReset();
  runExpiryCheckMock.mockResolvedValue({ checked: 0, notified: 0 });
});

afterEach(() => {
  expiryWarningJob.stopExpiryWarningJob();
  vi.useRealTimers();
});

describe('startExpiryWarningJob', () => {
  it('runs the sweep immediately on start', async () => {
    expiryWarningJob.startExpiryWarningJob();
    await vi.waitFor(() => expect(runExpiryCheckMock).toHaveBeenCalledTimes(1));
  });

  it('does not re-run within the same day across many hourly ticks', async () => {
    expiryWarningJob.startExpiryWarningJob();
    await vi.waitFor(() => expect(runExpiryCheckMock).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(ONE_HOUR_MS);
    }

    expect(runExpiryCheckMock).toHaveBeenCalledTimes(1);
  });

  it('runs again once the calendar day changes', async () => {
    expiryWarningJob.startExpiryWarningJob();
    await vi.waitFor(() => expect(runExpiryCheckMock).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS);

    expect(runExpiryCheckMock).toHaveBeenCalledTimes(2);
  });

  it('retries the same day on the next tick after a failed sweep', async () => {
    runExpiryCheckMock.mockRejectedValueOnce(new Error('db down'));
    expiryWarningJob.startExpiryWarningJob();
    await vi.waitFor(() => expect(runExpiryCheckMock).toHaveBeenCalledTimes(1));

    runExpiryCheckMock.mockResolvedValueOnce({ checked: 0, notified: 0 });
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS);

    expect(runExpiryCheckMock).toHaveBeenCalledTimes(2);
  });

  it('is idempotent — calling start twice does not register a second interval', async () => {
    expiryWarningJob.startExpiryWarningJob();
    await vi.waitFor(() => expect(runExpiryCheckMock).toHaveBeenCalledTimes(1));
    expiryWarningJob.startExpiryWarningJob(); // no-op: already started

    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS);

    // A doubled interval would fire two ticks for the new day at once,
    // which warningAlreadySent-based dedup would mask — so assert the
    // scheduler itself only ticked once by checking the call count is
    // exactly 2 (1 initial + 1 for the new day), not 3.
    expect(runExpiryCheckMock).toHaveBeenCalledTimes(2);
  });
});

describe('stopExpiryWarningJob', () => {
  it('stops future ticks and allows a fresh run on the next start', async () => {
    expiryWarningJob.startExpiryWarningJob();
    await vi.waitFor(() => expect(runExpiryCheckMock).toHaveBeenCalledTimes(1));

    expiryWarningJob.stopExpiryWarningJob();
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS * 5);
    expect(runExpiryCheckMock).toHaveBeenCalledTimes(1);

    expiryWarningJob.startExpiryWarningJob();
    await vi.waitFor(() => expect(runExpiryCheckMock).toHaveBeenCalledTimes(2));
  });
});
