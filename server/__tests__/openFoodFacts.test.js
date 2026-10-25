// ─────────────────────────────────────────────────────────────
// server/__tests__/openFoodFacts.test.js
//
// integrations/openFoodFacts.js: only the barcode goes out, the answer
// is shaped into a suggestion, and every failure is "no suggestion".
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from 'vitest';
import { lookupProduct, fetchProduct, setFetch } from '../src/integrations/openFoodFacts.js';

const reply = (body, ok = true, status = ok ? 200 : 500) => vi.fn(async () => ({ ok, status, json: async () => body }));

afterEach(() => { setFetch(null); delete process.env.OPEN_FOOD_FACTS_ENABLED; });

describe('Open Food Facts lookup', () => {
  it('asks for the code only, naming the app, and shapes the answer', async () => {
    const fetch = reply({
      status: 1,
      product: {
        product_name: 'Baked beans in tomato sauce', brands: 'Koo,Tiger Brands', quantity: '410 g',
        product_quantity: 410, product_quantity_unit: 'g', categories_tags: ['en:foods', 'en:canned-beans'],
      },
    });
    setFetch(fetch);
    expect(await lookupProduct('6001059920014')).toEqual({
      name: 'Koo Baked beans in tomato sauce 410 g', productName: 'Baked beans in tomato sauce',
      brand: 'Koo', quantity: '410 g', weightKg: 0.41, category: 'Canned beans',
      categories: ['foods', 'canned-beans'],
    });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/6001059920014\.json\?fields=/);
    expect(options.headers['User-Agent']).toMatch(/^LadlesOfLoveWMS/);
  });

  it('is no suggestion when the code is not known', async () => {
    setFetch(reply({ status: 0 }));
    expect(await lookupProduct('6001059920014')).toBeNull();
  });

  it('is no suggestion when the service fails', async () => {
    setFetch(vi.fn(async () => { throw new Error('ECONNRESET'); }));
    expect(await lookupProduct('6001059920014')).toBeNull();
    setFetch(reply({}, false));
    expect(await lookupProduct('6001059920014')).toBeNull();
  });

  it('never asks about a code that is not a retail barcode, or when switched off', async () => {
    const fetch = reply({ status: 1, product: { product_name: 'x' } });
    setFetch(fetch);
    expect(await lookupProduct('LOL12K2000')).toBeNull();
    process.env.OPEN_FOOD_FACTS_ENABLED = 'false';
    expect(await lookupProduct('6001059920014')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tells a code it does not know from a lookup that failed', async () => {
    setFetch(reply({ status: 0 }, false, 404));
    expect(await fetchProduct('6001059920014')).toEqual({ outcome: 'unknown', food: null });
    setFetch(reply({}, false, 503));
    expect(await fetchProduct('6001059920014')).toEqual({ outcome: 'failed', food: null });
    // Its "temporarily unavailable" page is HTML, not JSON.
    setFetch(vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } })));
    expect(await fetchProduct('6001059920014')).toEqual({ outcome: 'failed', food: null });
  });
});
