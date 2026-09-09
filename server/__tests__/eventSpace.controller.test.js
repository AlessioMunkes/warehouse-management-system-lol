import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = { listActiveSpaces: vi.fn(), createSpace: vi.fn() };
vi.mock('../src/services/eventSpace.service.js', () => ({ default: service }));
const controller = (await import('../src/controllers/eventSpace.controller.js')).default;

const response = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('eventSpace.controller', () => {
  it('returns the active-space envelope', async () => {
    const spaces = [{ space_id: 's1', space_name: 'Warehouse floor' }];
    const res = response();
    service.listActiveSpaces.mockResolvedValueOnce(spaces);

    await controller.listActiveSpaces({}, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: spaces });
  });

  it('forwards service errors', async () => {
    const error = new Error('database unavailable');
    const next = vi.fn();
    service.listActiveSpaces.mockRejectedValueOnce(error);

    await controller.listActiveSpaces({}, response(), next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('creates a space with the standard envelope', async () => {
    const space = { space_id: 's2', space_name: 'Kitchen' };
    const res = response();
    service.createSpace.mockResolvedValueOnce(space);
    await controller.createSpace({ body: { spaceName: 'Kitchen' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: space });
  });
});
