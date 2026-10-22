// ─────────────────────────────────────────────────────────────
// server/__tests__/barcodeMatch.test.js
//
// features/barcodeMatch/matchProducts.js: a second brand of the same
// food, the same size, is matched to the stock item that holds the
// first brand; a different size or a different food is not.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { matchProducts, nameWords } from '../src/features/barcodeMatch/matchProducts.js';

// Brand B's beans, as Open Food Facts describes them.
const BRAND_B_BEANS = {
  productName: 'Baked Beans in Tomato Sauce', brand: 'Brand B', weightKg: 0.41,
  categories: ['plant-based-foods', 'legumes', 'canned-foods', 'baked-beans'],
};

// Brand A's barcode is on this stock item, with what was said about it.
const BEANS_410 = {
  id: 1, name: 'Baked Beans 410g', sku: 'BEANS-410', weightKg: 0.41,
  barcodes: [{
    foodName: 'Baked beans', foodBrand: 'Brand A', foodWeightKg: 0.41,
    foodCategories: ['plant-based-foods', 'legumes', 'canned-foods', 'baked-beans'],
  }],
};
const BEANS_800 = { id: 2, name: 'Baked Beans 800g', sku: 'BEANS-800', weightKg: 0.8, barcodes: [] };
const RICE = { id: 3, name: 'Rice 1kg', sku: 'RICE-1KG', weightKg: 1, barcodes: [] };
const PILCHARDS = {
  id: 4, name: 'Pilchards in tomato sauce 400g', sku: 'PIL-400', weightKg: 0.4,
  barcodes: [{ foodName: 'Pilchards in tomato sauce', foodBrand: 'Lucky Star', foodWeightKg: 0.4,
    foodCategories: ['seafood', 'canned-foods', 'canned-fishes', 'pilchards'] }],
};

describe('nameWords', () => {
  it('keeps the words that say what the food is: no brand, size, filler or what it is packed in', () => {
    expect([...nameWords('Brand B Baked Beans in Tomato Sauce 410g', 'Brand B')])
      .toEqual(['baked', 'bean']);
  });
});

describe('matchProducts', () => {
  it('matches Brand B’s beans to the stock item with Brand A’s, for size, name and kind', () => {
    const [best, ...rest] = matchProducts(BRAND_B_BEANS, [RICE, BEANS_800, PILCHARDS, BEANS_410]);
    expect(best).toMatchObject({ productId: 1, productName: 'Baked Beans 410g', reasons: ['size', 'name', 'kind'] });
    expect(rest.map((r) => r.productId)).not.toContain(2);   // 800 g is a different stock item
    expect(rest.map((r) => r.productId)).not.toContain(3);
  });

  it('never suggests a different pack size, however alike the names', () => {
    expect(matchProducts(BRAND_B_BEANS, [BEANS_800])).toEqual([]);
  });

  it('treats 400 g and 410 g as different stock items', () => {
    const beans400 = { id: 7, name: 'Baked beans 400g', weightKg: 0.4, barcodes: [] };
    expect(matchProducts(BRAND_B_BEANS, [beans400])).toEqual([]);
  });

  it('matches on name and size when no barcode is on the stock item yet', () => {
    const plain = { id: 5, name: 'Baked beans 410g', weightKg: 0.41, barcodes: [] };
    expect(matchProducts(BRAND_B_BEANS, [plain])[0]).toMatchObject({ productId: 5, reasons: ['size', 'name'] });
  });

  it('does not offer a food that only shares a sauce', () => {
    // Pilchards in tomato sauce share "tomato sauce", but at a different size
    // and a different kind: not offered.
    const result = matchProducts(BRAND_B_BEANS, [PILCHARDS]);
    expect(result).toEqual([]);
  });

  it('says nothing when nothing is like it', () => {
    expect(matchProducts({ productName: 'Peanut butter', weightKg: 0.4, categories: ['spreads'] }, [RICE, BEANS_410])).toEqual([]);
    expect(matchProducts(null, [BEANS_410])).toEqual([]);
  });

  it('needs more than a size to say what the food is', () => {
    const sameSizeOnly = { id: 6, name: 'Sugar beans 410g', weightKg: 0.41, barcodes: [] };
    const result = matchProducts({ productName: 'Chakalaka', weightKg: 0.41, categories: [] }, [sameSizeOnly]);
    expect(result).toEqual([]);
  });

  // Real data: Open Food Facts on 5000157024671, Oct 2026, and the dev
  // catalogue's own "Baked Beans" (no weight recorded).
  const HEINZ = {
    productName: 'Beanz in a rich tomato sauce', brand: 'H J Heinz Foods UK Ltd', weightKg: 0.415,
    categories: ['plant-based-foods-and-beverages', 'plant-based-foods', 'legumes-and-their-products',
      'fruits-and-vegetables-based-foods', 'legumes', 'vegetable-based-foods-and-beverages', 'canned-foods',
      'vegetables-based-foods', 'canned-plant-based-foods', 'prepared-vegetables', 'baked-beans-in-tomato-sauce',
      'canned-legumes', 'canned-common-beans'],
  };

  it('finds a brand that spells the name its own way, by the category it is filed under', () => {
    const bakedBeans = { id: 1265, name: 'Baked Beans', weightKg: null, barcodes: [] };
    expect(matchProducts(HEINZ, [bakedBeans])).toEqual([expect.objectContaining({ productId: 1265, reasons: ['name'] })]);
  });

  it('never matches a stock item only because a broad category contains its word', () => {
    const vegetables = { id: 8, name: 'Vegetables', weightKg: null, barcodes: [] };
    const legumes = { id: 9, name: 'Beans', weightKg: null, barcodes: [] };
    expect(matchProducts(HEINZ, [vegetables, legumes])).toEqual([]);
  });

  it('returns at most three, best first', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: 10 + i, name: `Baked beans ${i}`, weightKg: 0.41, barcodes: [] }));
    const result = matchProducts(BRAND_B_BEANS, [...many, BEANS_410]);
    expect(result).toHaveLength(3);
    expect(result[0].productId).toBe(1);
  });
});
