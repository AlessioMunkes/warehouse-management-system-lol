// ─────────────────────────────────────────────────────────────
// server/__tests__/recipes.test.js
//
// Recipes (Settings → Recipes): which recipe applies on a date, what an
// admin may save, and how slip generation falls back to the standing
// order. The repository is mocked for the service tests; the generation
// tests drive picking.repository against a scripted client.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seasonFor, recipeForDate, isRealDayOfYear, bandedChildCount } from '../src/features/recipes/recipeSeason.js';

const repo = {
  listRecipes: vi.fn(), listOwnOrderCentres: vi.fn(), getRecipeById: vi.fn(),
  missingProducts: vi.fn(), missingCentres: vi.fn(),
  createOverride: vi.fn(), updateRecipe: vi.fn(), deleteOverride: vi.fn(),
  setSeasonStarts: vi.fn(), setOwnOrderCentres: vi.fn(),
  resolveForDate: vi.fn(), insertSlipItemsFromRecipe: vi.fn(),
};
vi.mock('../src/repositories/recipe.repository.js', () => ({ default: repo }));

const { default: recipeService } = await import('../src/services/recipe.service.js');

const SUMMER = { id: 1, name: 'Summer', kind: 'summer', season_start_month: 9, season_start_day: 1, starts_on: null, ends_on: null, lines: [] };
const WINTER = { id: 2, name: 'Winter', kind: 'winter', season_start_month: 5, season_start_day: 1, starts_on: null, ends_on: null, lines: [] };
const HOLIDAY = { id: 3, name: 'December holiday', kind: 'override', starts_on: '2026-12-15', ends_on: '2026-12-31', lines: [] };
const STARTS = { summer: { month: 9, day: 1 }, winter: { month: 5, day: 1 } };
const LINE = { productId: 7, quantityPerChild: 0.3, unit: 'kg' };

beforeEach(() => {
  vi.clearAllMocks();
  repo.listRecipes.mockResolvedValue([SUMMER, WINTER, HOLIDAY]);
  repo.listOwnOrderCentres.mockResolvedValue([]);
  repo.missingProducts.mockResolvedValue([]);
  repo.missingCentres.mockResolvedValue([]);
});

describe('seasonFor', () => {
  it('puts a date in whichever season started most recently', () => {
    expect(seasonFor('2026-09-01', STARTS)).toBe('summer');
    expect(seasonFor('2026-12-25', STARTS)).toBe('summer');
    expect(seasonFor('2026-01-15', STARTS)).toBe('summer');   // summer runs over the new year
    expect(seasonFor('2026-04-30', STARTS)).toBe('summer');
    expect(seasonFor('2026-05-01', STARTS)).toBe('winter');
    expect(seasonFor('2026-08-31', STARTS)).toBe('winter');
  });

  it('works when summer is the one that starts earlier in the year', () => {
    const north = { summer: { month: 4, day: 1 }, winter: { month: 10, day: 15 } };
    expect(seasonFor('2026-06-01', north)).toBe('summer');
    expect(seasonFor('2026-10-15', north)).toBe('winter');
    expect(seasonFor('2026-02-01', north)).toBe('winter');
  });
});

describe('recipeForDate', () => {
  it('uses the season when no override covers the day', () => {
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY], '2026-10-06').id).toBe(1);
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY], '2026-06-10').id).toBe(2);
  });

  it('lets an override replace the season inside its dates, both ends included', () => {
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY], '2026-12-15').id).toBe(3);
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY], '2026-12-31').id).toBe(3);
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY], '2026-12-14').id).toBe(1);
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY], '2027-01-01').id).toBe(1);
  });

  it('picks the override that started most recently when two overlap', () => {
    const later = { ...HOLIDAY, id: 4, starts_on: '2026-12-20', ends_on: '2026-12-24' };
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY, later], '2026-12-22').id).toBe(4);
    expect(recipeForDate([SUMMER, WINTER, HOLIDAY, later], '2026-12-26').id).toBe(3);
  });
});

describe('bandedChildCount', () => {
  it('rounds a child count up to the next band', () => {
    expect(bandedChildCount(23, 5)).toBe(25);
    expect(bandedChildCount(21, 5)).toBe(25);
    expect(bandedChildCount(25, 5)).toBe(25);
    expect(bandedChildCount(26, 5)).toBe(30);
    expect(bandedChildCount(1, 5)).toBe(5);
    expect(bandedChildCount(42, 10)).toBe(50);
  });

  it('uses the exact count for a band of 1, and nothing for no children', () => {
    expect(bandedChildCount(23, 1)).toBe(23);
    expect(bandedChildCount(0, 5)).toBe(0);
    expect(bandedChildCount(null, 5)).toBe(0);
  });

  it('treats an unusable band as 1 rather than dividing by it', () => {
    expect(bandedChildCount(23, 0)).toBe(23);
    expect(bandedChildCount(23, undefined)).toBe(23);
  });
});

describe('isRealDayOfYear', () => {
  it('refuses days that do not exist every year', () => {
    expect(isRealDayOfYear(2, 28)).toBe(true);
    expect(isRealDayOfYear(2, 29)).toBe(false);
    expect(isRealDayOfYear(4, 31)).toBe(false);
    expect(isRealDayOfYear(13, 1)).toBe(false);
    expect(isRealDayOfYear(5, 0)).toBe(false);
  });
});

describe('recipe service — saving a recipe', () => {
  it('saves a season recipe with its lines and leaves its name and dates alone', async () => {
    repo.getRecipeById.mockResolvedValue(SUMMER);
    await recipeService.updateRecipe(1, { name: 'Renamed', lines: [LINE] });
    expect(repo.updateRecipe).toHaveBeenCalledWith(1, { lines: [LINE] });
  });

  it('saves an override with its name and dates', async () => {
    repo.getRecipeById.mockResolvedValue(HOLIDAY);
    await recipeService.updateRecipe(3, { name: '  Festive  ', startsOn: '2026-12-10', endsOn: '2026-12-31', lines: [LINE] });
    expect(repo.updateRecipe).toHaveBeenCalledWith(3, { name: 'Festive', startsOn: '2026-12-10', endsOn: '2026-12-31', lines: [LINE] });
  });

  it.each([
    ['no product', [{ ...LINE, productId: null }]],
    ['a zero amount', [{ ...LINE, quantityPerChild: 0 }]],
    ['a negative amount', [{ ...LINE, quantityPerChild: -1 }]],
    ['a blank amount', [{ ...LINE, quantityPerChild: '' }]],
    ['an unknown unit', [{ ...LINE, unit: 'sack' }]],
    ['the same product twice', [LINE, LINE]],
  ])('refuses a line with %s', async (_label, lines) => {
    repo.getRecipeById.mockResolvedValue(SUMMER);
    await expect(recipeService.updateRecipe(1, { lines })).rejects.toMatchObject({ status: 400 });
    expect(repo.updateRecipe).not.toHaveBeenCalled();
  });

  it('refuses an archived product', async () => {
    repo.getRecipeById.mockResolvedValue(SUMMER);
    repo.missingProducts.mockResolvedValue([7]);
    await expect(recipeService.updateRecipe(1, { lines: [LINE] })).rejects.toMatchObject({ status: 400 });
  });

  it('allows an empty recipe, which hands slips back to standing orders', async () => {
    repo.getRecipeById.mockResolvedValue(SUMMER);
    await recipeService.updateRecipe(1, { lines: [] });
    expect(repo.updateRecipe).toHaveBeenCalledWith(1, { lines: [] });
  });

  it('404s for a recipe that does not exist', async () => {
    repo.getRecipeById.mockResolvedValue(null);
    await expect(recipeService.updateRecipe(99, { lines: [] })).rejects.toMatchObject({ status: 404 });
  });
});

describe('recipe service — overrides', () => {
  it('creates one with a name, dates and lines', async () => {
    await recipeService.createOverride({ name: 'Easter', startsOn: '2027-03-20', endsOn: '2027-03-31', lines: [LINE] }, 5);
    expect(repo.createOverride).toHaveBeenCalledWith({ name: 'Easter', startsOn: '2027-03-20', endsOn: '2027-03-31', lines: [LINE], userId: 5 });
  });

  it.each([
    ['no name', { name: ' ', startsOn: '2027-03-20', endsOn: '2027-03-31' }],
    ['no start', { name: 'Easter', endsOn: '2027-03-31' }],
    ['a date that does not exist', { name: 'Easter', startsOn: '2027-02-30', endsOn: '2027-03-31' }],
    ['an end before the start', { name: 'Easter', startsOn: '2027-03-31', endsOn: '2027-03-20' }],
  ])('refuses one with %s', async (_label, body) => {
    await expect(recipeService.createOverride({ ...body, lines: [] }, 5)).rejects.toMatchObject({ status: 400 });
    expect(repo.createOverride).not.toHaveBeenCalled();
  });

  it('deletes an override but never a season recipe', async () => {
    repo.getRecipeById.mockResolvedValue(HOLIDAY);
    await recipeService.deleteOverride(3);
    expect(repo.deleteOverride).toHaveBeenCalledWith(3);

    repo.getRecipeById.mockResolvedValue(SUMMER);
    await expect(recipeService.deleteOverride(1)).rejects.toMatchObject({ status: 400 });
    expect(repo.deleteOverride).toHaveBeenCalledTimes(1);
  });
});

describe('recipe service — seasons and centres', () => {
  it('saves when each season starts', async () => {
    await recipeService.setSeasonStarts({ summer: { month: 10, day: 1 }, winter: { month: 4, day: 15 } });
    expect(repo.setSeasonStarts).toHaveBeenCalledWith({ summer: { month: 10, day: 1 }, winter: { month: 4, day: 15 } });
  });

  it('refuses a day that is not real, and the same day for both', async () => {
    await expect(recipeService.setSeasonStarts({ summer: { month: 2, day: 30 }, winter: { month: 5, day: 1 } })).rejects.toMatchObject({ status: 400 });
    await expect(recipeService.setSeasonStarts({ summer: { month: 5, day: 1 }, winter: { month: 5, day: 1 } })).rejects.toMatchObject({ status: 400 });
    expect(repo.setSeasonStarts).not.toHaveBeenCalled();
  });

  it('saves the centres that keep their own order, once each', async () => {
    await recipeService.setOwnOrderCentres({ ecdIds: [4, 9, 4] }, 5);
    expect(repo.setOwnOrderCentres).toHaveBeenCalledWith([4, 9], 5);
  });

  it('refuses a centre that does not exist', async () => {
    repo.missingCentres.mockResolvedValue([9]);
    await expect(recipeService.setOwnOrderCentres({ ecdIds: [9] }, 5)).rejects.toMatchObject({ status: 400 });
  });

  it('tells the screen which recipe today falls under', async () => {
    const overview = await recipeService.getOverview();
    expect(overview.recipes.map((r) => r.kind)).toEqual(['summer', 'winter', 'override']);
    expect([1, 2, 3]).toContain(overview.currentRecipeId);
    expect(overview.recipes[0].seasonStart).toEqual({ month: 9, day: 1 });
  });
});
