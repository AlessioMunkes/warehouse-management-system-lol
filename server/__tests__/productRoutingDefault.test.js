// ─────────────────────────────────────────────────────────────
// server/__tests__/productRoutingDefault.test.js
//
// What category a donated product belongs to when nobody has set one.
// Only a handful of products ever had a saved category, so a donation
// of soya mince, which is on the recipe, went to a manager to be told
// it was recipe food. An ingredient on a recipe is recipe food.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const pool = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: pool }));

const { default: productRepo } = await import('../src/repositories/product.repository.js');

beforeEach(() => vi.clearAllMocks());

describe('getProductRoutingDefault', () => {
  it('uses the saved category when there is one, without looking at recipes', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ product_id: 4, donation_category: 'non_recipe_food' }] });
    const found = await productRepo.getProductRoutingDefault(4);
    expect(found.donation_category).toBe('non_recipe_food');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('treats an ingredient on a recipe as recipe food when nothing is saved', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const found = await productRepo.getProductRoutingDefault(12);
    expect(found).toMatchObject({ product_id: 12, donation_category: 'recipe_food', inferred_from: 'recipe' });
    expect(pool.query.mock.calls[1][0]).toMatch(/recipe_lines/);
  });

  it('has no answer for a product that is on no recipe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    expect(await productRepo.getProductRoutingDefault(99)).toBeNull();
  });

  it('has no answer, rather than an error, where the recipes tables do not exist', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('relation "recipe_lines" does not exist'), { code: '42P01' }));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await productRepo.getProductRoutingDefault(12)).toBeNull();
    quiet.mockRestore();
  });
});
