import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../services/api', () => ({
  apiGet,
  apiPost,
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
}));

const { getSpaces, createSpace } = await import('../services/volunteerManagementAPI');

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
