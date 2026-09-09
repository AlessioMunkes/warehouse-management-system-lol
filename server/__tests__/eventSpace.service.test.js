import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = { findAll: vi.fn(), findByName: vi.fn(), createSpace: vi.fn() };
vi.mock('../src/repositories/eventSpace.repository.js', () => ({ default: repository }));

const service = (await import('../src/services/eventSpace.service.js')).default;

beforeEach(() => vi.clearAllMocks());

describe('eventSpace.service listActiveSpaces', () => {
  it('requests active spaces only', async () => {
    const spaces = [{ space_id: 's1', space_name: 'Warehouse floor', is_active: true }];
    repository.findAll.mockResolvedValueOnce(spaces);

    await expect(service.listActiveSpaces()).resolves.toEqual(spaces);
    expect(repository.findAll).toHaveBeenCalledWith({ isActive: true });
  });
});

describe('eventSpace.service createSpace', () => {
  it('creates a trimmed active space', async () => {
    repository.findByName.mockResolvedValueOnce(null);
    repository.createSpace.mockResolvedValueOnce({ space_id: 's2', space_name: 'Kitchen', is_active: true });
    await service.createSpace({ spaceName: ' Kitchen ', location: ' Warehouse ' });
    expect(repository.createSpace).toHaveBeenCalledWith({ spaceName: 'Kitchen', location: 'Warehouse', description: null, is_active: true });
  });

  it('rejects a duplicate space name', async () => {
    repository.findByName.mockResolvedValueOnce({ space_id: 's1' });
    await expect(service.createSpace({ spaceName: 'Kitchen' })).rejects.toMatchObject({ status: 409 });
  });
});
