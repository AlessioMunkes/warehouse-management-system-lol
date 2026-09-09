// server/__tests__/vmsIntegration.service.test.js
// Phase 4 targeted tests: VMSIntegrationService delegates to the adapter only.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const publishMock = vi.fn();
vi.mock('../src/integrations/mockVMS.adapter.js', () => ({
  default: { publishEventBooking: publishMock },
}));

const mod = await import('../src/services/vmsIntegration.service.js');
const svc = mod.default;

beforeEach(() => {
  vi.clearAllMocks();
  svc.setAdapter({ publishEventBooking: publishMock });
});

describe('VMSIntegrationService adapter delegation', () => {
  it('exposes only publishEventBooking and delegates to the adapter', async () => {
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    const payload = { entityType: 'event_booking', entityId: 'e1' };
    const result = await svc.publishEventBooking(payload);
    expect(result).toEqual({ externalId: 'VMS-EVENT_BOOKING-e1' });
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(payload);
    expect(Object.keys(svc).sort()).toEqual(['getAdapter', 'publishEventBooking', 'setAdapter'].sort());
  });
});
