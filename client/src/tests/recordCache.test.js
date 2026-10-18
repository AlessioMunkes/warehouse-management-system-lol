// ─────────────────────────────────────────────────────────────
// src/tests/recordCache.test.js
//
// Asking for a record when the pointer rests on its row, so the click
// finds the answer already on its way.
// ─────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordCache, rowIntent } from '@/lib/recordCache';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createRecordCache', () => {
  it('lets the click reuse what resting on the row asked for', async () => {
    const fetcher = vi.fn(async (id) => ({ id }));
    const records = createRecordCache(fetcher);
    records.warm(7);
    await expect(records.load(7)).resolves.toEqual({ id: 7 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reads again after a save, and once the answer is a few seconds old', async () => {
    const fetcher = vi.fn(async (id) => ({ id }));
    const records = createRecordCache(fetcher);
    await records.load(7);
    await records.load(7, { fresh: true });
    expect(fetcher).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(11_000);
    await records.load(7);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not keep a failure: the next click tries again', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 7 });
    const records = createRecordCache(fetcher);
    records.warm(7);
    await expect(records.load(7)).rejects.toThrow('offline');
    await expect(records.load(7)).resolves.toEqual({ id: 7 });
  });
});

describe('rowIntent', () => {
  it('asks when the pointer rests on a row, not when it passes over', () => {
    const warm = vi.fn();
    const row = rowIntent(warm);
    row.onPointerEnter();
    vi.advanceTimersByTime(30);
    row.onPointerLeave();
    vi.advanceTimersByTime(200);
    expect(warm).not.toHaveBeenCalled();

    row.onPointerEnter();
    vi.advanceTimersByTime(60);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('asks at once on a press', () => {
    const warm = vi.fn();
    rowIntent(warm).onPointerDown();
    expect(warm).toHaveBeenCalledTimes(1);
  });
});
