import { describe, it, expect } from 'vitest';
import {
  localDateTimeValue, isFutureRequestedAt, withRequestedAtForServer,
} from '../features/communityRequests/requestedAt';

describe('requestedAt helpers', () => {
  it('converts a local datetime-local value to an ISO instant', () => {
    const form = { itemsRequested: 'Samp', requestedAt: '2026-10-02T14:30' };
    const out = withRequestedAtForServer(form);
    expect(out.requestedAt).toBe(new Date('2026-10-02T14:30').toISOString());
    expect(out.requestedAt.endsWith('Z')).toBe(true);
    expect(out.itemsRequested).toBe('Samp');
  });

  it('omits requestedAt when the field is empty', () => {
    const out = withRequestedAtForServer({ itemsRequested: 'Samp', requestedAt: '' });
    expect('requestedAt' in out).toBe(false);
  });

  it('formats local now for the max attribute', () => {
    expect(localDateTimeValue(new Date(2026, 9, 2, 8, 5))).toBe('2026-10-02T08:05');
  });

  it('flags a time after now and accepts now or earlier', () => {
    const now = new Date(2026, 9, 2, 12, 0);
    expect(isFutureRequestedAt('2026-10-02T12:01', now)).toBe(true);
    expect(isFutureRequestedAt('2026-10-02T12:00', now)).toBe(false);
    expect(isFutureRequestedAt('2026-10-01T09:00', now)).toBe(false);
    expect(isFutureRequestedAt('', now)).toBe(false);
  });
});
