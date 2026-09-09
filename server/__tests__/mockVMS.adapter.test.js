// server/__tests__/mockVMS.adapter.test.js
// Phase 4 targeted tests: MockVMSAdapter simulator only.
import { describe, it, expect, beforeEach } from 'vitest';
import mockAdapter from '../src/integrations/mockVMS.adapter.js';

beforeEach(() => {
  mockAdapter.resetMockVMS();
});

describe('MockVMSAdapter success', () => {
  it('publishes successfully with a deterministic fake external ID', async () => {
    const first = await mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' });
    const second = await mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' });
    expect(first.externalId).toBe('VMS-EVENT_BOOKING-e1');
    expect(second.externalId).toBe(first.externalId);
    expect(first.publishedAt).toBeTruthy();
  });
});

describe('MockVMSAdapter failure', () => {
  it('fails when forced failure mode is on', async () => {
    mockAdapter.setForceFail(true);
    await expect(mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' })).rejects.toThrow(
      /VMS unavailable/
    );
  });

  it('fails transiently via failNext then recovers (retry success)', async () => {
    mockAdapter.failNext(1);
    await expect(mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' })).rejects.toThrow(
      /transient/
    );
    const ok = await mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' });
    expect(ok.externalId).toBe('VMS-EVENT_BOOKING-e1');
  });

  it('supports per-call forced failure for tests', async () => {
    await expect(
      mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1', forceFail: true })
    ).rejects.toThrow(/forced/);
  });
});
