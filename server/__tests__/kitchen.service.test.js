// ─────────────────────────────────────────────────────────────
// server/__tests__/kitchen.service.test.js
//
// Soup kitchens and Dignity Kitchens (migration 068): what a kitchen
// needs to be registered, and what refuses.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = { listKitchens: vi.fn(), getKitchen: vi.fn(), createKitchen: vi.fn(), updateKitchen: vi.fn() };
vi.mock('../src/repositories/kitchen.repository.js', () => ({ default: repoMock }));

const { default: kitchenService } = await import('../src/services/kitchen.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.createKitchen.mockImplementation(async (k) => ({ id: 1, ...k }));
  repoMock.updateKitchen.mockImplementation(async (id, patch) => ({ id, ...patch }));
});

describe('registering a kitchen', () => {
  it('keeps its kind, name and the adults it feeds per collection', async () => {
    await kitchenService.createKitchen({ kind: 'soup_kitchen', name: '  Hope   Soup Kitchen ', adultCount: '80' });
    expect(repoMock.createKitchen).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'soup_kitchen', name: 'Hope Soup Kitchen', adultCount: 80,
    }));
  });

  it('refuses anything but a soup kitchen or the Dignity Kitchen, a blank name, and a part adult', async () => {
    await expect(kitchenService.createKitchen({ kind: 'ecd', name: 'X' })).rejects.toMatchObject({ status: 400 });
    await expect(kitchenService.createKitchen({ kind: 'dignity_kitchen', name: ' ' })).rejects.toMatchObject({ status: 400 });
    await expect(kitchenService.createKitchen({ kind: 'dignity_kitchen', name: 'DK', adultCount: 2.5 })).rejects.toMatchObject({ status: 400 });
    expect(repoMock.createKitchen).not.toHaveBeenCalled();
  });

  it('says so when the name is already registered', async () => {
    repoMock.createKitchen.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(kitchenService.createKitchen({ kind: 'soup_kitchen', name: 'Hope' }))
      .rejects.toMatchObject({ status: 409, message: 'A kitchen called "Hope" is already registered.' });
  });

  it('changes only what was sent, and clears an adult count sent blank', async () => {
    await kitchenService.updateKitchen('4', { adultCount: '' });
    expect(repoMock.updateKitchen).toHaveBeenCalledWith(4, { adultCount: null });
    await expect(kitchenService.updateKitchen(4, {})).rejects.toMatchObject({ status: 400 });
  });
});
