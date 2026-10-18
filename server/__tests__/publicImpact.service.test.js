// ─────────────────────────────────────────────────────────────
// server/__tests__/publicImpact.service.test.js
//
// The landing page's three public counters. No database — the
// repository functions are mocked and each test asserts the shape
// and the fallback/caching behaviour, not real SQL (that's already
// covered for paperSaved/compostProcessed/childrenReached by
// reporting.impactCalculator.repository.test.js).
//
// vi.resetModules() + a fresh import per test that cares about the
// in-process cache, same pattern auth.test.js's getFreshApp() uses —
// the cache is module-level singleton state that would otherwise
// leak between tests in this file.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  paperSaved: vi.fn(),
  compostProcessed: vi.fn(),
  childrenReached: vi.fn(),
};
vi.mock('../src/repositories/reporting.repository.js', () => ({ default: repoMock }));

const getFreshService = async () => {
  vi.resetModules();
  const { default: service } = await import('../src/services/publicImpact.service.js');
  return service;
};

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.paperSaved.mockResolvedValue([{ label: 'Total', value: 18540 }]);
  repoMock.compostProcessed.mockResolvedValue([{ label: 'Total', value: 9280 }]);
  repoMock.childrenReached.mockResolvedValue([{ label: 'Total', value: 6150 }]);
});

describe('getPublicImpactSummary', () => {
  it('returns the three totals, rounded', async () => {
    const service = await getFreshService();
    const summary = await service.getPublicImpactSummary();
    expect(summary).toEqual({ paper: 18540, compost: 9280, children: 6150 });
  });

  it('calls each repository function with dimension "none" and no caller-supplied input', async () => {
    const service = await getFreshService();
    await service.getPublicImpactSummary();

    for (const fn of [repoMock.paperSaved, repoMock.compostProcessed, repoMock.childrenReached]) {
      expect(fn).toHaveBeenCalledTimes(1);
      const [spec] = fn.mock.calls[0];
      expect(spec.dimension).toBe('none');
      expect(spec.filters).toEqual({});
      expect(spec.dateRange.from).toBe('2020-01-01');
      expect(spec.dateRange.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('falls back to 0 for one metric without failing the others', async () => {
    repoMock.compostProcessed.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));

    const service = await getFreshService();
    const summary = await service.getPublicImpactSummary();

    expect(summary).toEqual({ paper: 18540, compost: 0, children: 6150 });
  });

  it('caches results — a second call within the TTL does not re-query', async () => {
    const service = await getFreshService();
    await service.getPublicImpactSummary();
    await service.getPublicImpactSummary();

    expect(repoMock.paperSaved).toHaveBeenCalledTimes(1);
    expect(repoMock.compostProcessed).toHaveBeenCalledTimes(1);
    expect(repoMock.childrenReached).toHaveBeenCalledTimes(1);
  });
});
