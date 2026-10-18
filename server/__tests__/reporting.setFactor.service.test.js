// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.setFactor.service.test.js
//
// reporting.service.js's setFactor/getFactorHistory, against a
// mocked reportingFactor.repository.js — no database. Covers the
// validation reporting.controller.js relies on: an unknown factor key
// is rejected before any write, and value must be a positive number
// (a factor of 0 would silently zero out every meals/adults figure it
// feeds).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const factorRepoMock = {
  FACTOR_KEYS: ['kg_to_meals', 'kg_to_adults_served'],
  setFactor: vi.fn(),
  listFactorHistory: vi.fn(),
};
vi.mock('../src/repositories/reportingFactor.repository.js', () => ({ default: factorRepoMock }));

const { default: service } = await import('../src/services/reporting.service.js');

const ACTOR_ID = 3;

beforeEach(() => vi.clearAllMocks());

describe('setFactor', () => {
  it('rejects an unknown factor key without writing', async () => {
    await expect(service.setFactor({ factorKey: 'kg_to_unicorns', value: 2, actorId: ACTOR_ID }))
      .rejects.toMatchObject({ status: 400 });
    expect(factorRepoMock.setFactor).not.toHaveBeenCalled();
  });

  it('rejects a non-positive value', async () => {
    await expect(service.setFactor({ factorKey: 'kg_to_meals', value: 0, actorId: ACTOR_ID }))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.setFactor({ factorKey: 'kg_to_meals', value: -1, actorId: ACTOR_ID }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a non-numeric value', async () => {
    await expect(service.setFactor({ factorKey: 'kg_to_meals', value: 'lots', actorId: ACTOR_ID }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('passes a valid factor through to the repository', async () => {
    factorRepoMock.setFactor.mockResolvedValue({
      factor_key: 'kg_to_meals', value: 2.5, unit: 'meals per kg',
      source_note: 'from the NGO', effective_from: '2026-09-15',
    });

    const result = await service.setFactor({
      factorKey: 'kg_to_meals', value: '2.5', unit: 'meals per kg',
      sourceNote: 'from the NGO', actorId: ACTOR_ID,
    });

    expect(factorRepoMock.setFactor).toHaveBeenCalledWith({
      factorKey: 'kg_to_meals', value: 2.5, unit: 'meals per kg',
      sourceNote: 'from the NGO', actorId: ACTOR_ID,
    });
    expect(result.value).toBe(2.5);
  });
});

describe('getFactorHistory', () => {
  it('delegates to the repository', async () => {
    factorRepoMock.listFactorHistory.mockResolvedValue([{ factor_key: 'kg_to_meals', value: 2.5 }]);
    const result = await service.getFactorHistory('kg_to_meals');
    expect(factorRepoMock.listFactorHistory).toHaveBeenCalledWith('kg_to_meals');
    expect(result).toEqual([{ factor_key: 'kg_to_meals', value: 2.5 }]);
  });
});
