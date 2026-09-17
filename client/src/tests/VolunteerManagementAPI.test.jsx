import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../services/api', () => ({
  apiGet,
  apiPost,
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
}));

const { getSpaces, createSpace, validateTimeslot, createEventWithInitialTimeslot } = await import('../services/volunteerManagementAPI');

beforeEach(() => vi.clearAllMocks());

describe('volunteerManagementAPI.getSpaces', () => {
  it('calls the read-only space endpoint and maps space names', async () => {
    apiGet.mockResolvedValueOnce({
      success: true,
      data: [{ space_id: 's1', space_name: 'Community Hall', location: 'Cape Town', is_active: true }],
    });

    await expect(getSpaces()).resolves.toEqual([{
      id: 's1',
      name: 'Community Hall',
      description: '',
      location: 'Cape Town',
      isActive: true,
    }]);
    expect(apiGet).toHaveBeenCalledWith('/api/love-activism/spaces');
  });
});

describe('volunteerManagementAPI.createSpace', () => {
  it('creates and maps an active event space', async () => {
    apiPost.mockResolvedValueOnce({ data: { space_id: 's2', space_name: 'Kitchen', location: 'Warehouse', is_active: true } });
    await expect(createSpace({ spaceName: 'Kitchen', location: 'Warehouse' })).resolves.toMatchObject({ id: 's2', name: 'Kitchen' });
    expect(apiPost).toHaveBeenCalledWith('/api/love-activism/spaces', { spaceName: 'Kitchen', location: 'Warehouse' });
  });
});

describe('volunteerManagementAPI.validateTimeslot', () => {
  it('posts a read-only availability check', async () => {
    const payload = {
      eventDate: '2026-10-01',
      spaceId: 's1',
      startTime: '2026-10-01T09:00:00.000Z',
      endTime: '2026-10-01T10:00:00.000Z',
    };
    apiPost.mockResolvedValueOnce({ data: { available: true, conflicts: [] } });
    await expect(validateTimeslot(payload)).resolves.toEqual({ available: true, conflicts: [] });
    expect(apiPost).toHaveBeenCalledWith('/api/love-activism/timeslots/validate', payload);
  });

  it('posts a multi-timeslot availability check and preserves indexed conflicts', async () => {
    const payload = {
      eventDate: '2026-10-01',
      spaceId: 's1',
      timeslots: [
        { startTime: '2026-10-01T09:00:00.000Z', endTime: '2026-10-01T10:00:00.000Z', capacity: 10 },
        { startTime: '2026-10-01T10:30:00.000Z', endTime: '2026-10-01T11:30:00.000Z', capacity: 12 },
      ],
    };
    apiPost.mockResolvedValueOnce({ data: { available: false, conflicts: [{ index: 1, message: 'Conflict' }] } });
    await expect(validateTimeslot(payload)).resolves.toEqual({ available: false, conflicts: [{ index: 1, message: 'Conflict' }] });
    expect(apiPost).toHaveBeenCalledWith('/api/love-activism/timeslots/validate', payload);
  });
});

describe('volunteerManagementAPI.createEventWithInitialTimeslot', () => {
  it('posts combined event creation and maps event and timeslots', async () => {
    const payload = { eventName: 'Drive', spaceId: 's1' };
    apiPost.mockResolvedValueOnce({
      data: {
        event: { event_id: 'e1', event_name: 'Drive', event_date: '2026-10-01', status: 'DRAFT' },
        timeslots: [{ timeslot_id: 't1', event_id: 'e1', space_id: 's1', start_time: '2026-10-01T09:00:00Z', end_time: '2026-10-01T10:00:00Z', capacity: 10, status: 'OPEN' }],
      },
    });
    await expect(createEventWithInitialTimeslot(payload)).resolves.toEqual({
      event: expect.objectContaining({ id: 'e1', name: 'Drive' }),
      timeslots: [expect.objectContaining({ id: 't1', eventId: 'e1', capacity: 10 })],
    });
    expect(apiPost).toHaveBeenCalledWith('/api/love-activism/events/with-initial-timeslot', payload);
  });
});
