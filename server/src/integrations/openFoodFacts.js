// ─────────────────────────────────────────────────────────────
// server/src/integrations/openFoodFacts.js
//
// What the public Open Food Facts database says a barcode is, as a
// suggestion for an admin adding a product: name, pack size, weight.
//
// WHAT IS SENT: the barcode digits, and nothing else. No product of
// ours, no stock, no person. Open Food Facts asks every caller to name
// itself in the User-Agent, which is the app's name only.
//
// NEVER RELIED ON. It is a free, volunteer-run database: it may not
// know the code, may be slow, may be down. Every one of those is "no
// suggestion", in at most TIMEOUT_MS, and the admin types the product
// as they always have. Nothing is saved from here; the admin reads the
// suggestion in the Add product form and saves what they choose.
//
// OPEN_FOOD_FACTS_ENABLED=false switches it off (a deployment that must
// not call out at all).
// ─────────────────────────────────────────────────────────────

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,brands,quantity,product_quantity,product_quantity_unit,categories_tags';
const TIMEOUT_MS = 5000;
const USER_AGENT = 'LadlesOfLoveWMS/1.0 (warehouse management system)';

let doFetch = (...args) => globalThis.fetch(...args);
// For tests.
export const setFetch = (fn) => { doFetch = fn ?? ((...args) => globalThis.fetch(...args)); };

export const isEnabled = () => process.env.OPEN_FOOD_FACTS_ENABLED !== 'false';

// 'en:canned-foods' → 'Canned foods'
const categoryLabel = (tag) => {
  const words = String(tag ?? '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
};

// Weight in kg from what the pack declares, only when it is a weight.
const weightKgOf = (amount, unit) => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = String(unit ?? 'g').toLowerCase();
  if (u === 'g') return Math.round(n) / 1000;
  if (u === 'kg') return n;
  return null;
};

// What Open Food Facts said about one code:
//   { outcome: 'found',   food }   it knows the product
//   { outcome: 'unknown', food: null }   it answered, and does not
//   { outcome: 'failed',  food: null }   no real answer: a timeout, the
//                         network, an error, or its "temporarily
//                         unavailable" page when it is limiting requests
// The difference matters to anything that remembers the answer: unknown
// is worth keeping, failed is worth asking again later.
//
// food: { name, productName, brand, quantity, weightKg, category, categories }
//   name         brand + product name + pack size, for showing
//   productName  the product name alone, for matching
//   categories   every category tag, most general first, without the
//                language prefix ('en:canned-foods' → 'canned-foods')
export const fetchProduct = async (code) => {
  if (!isEnabled() || !/^\d{8,14}$/.test(String(code))) return { outcome: 'unknown', food: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(`${ENDPOINT}/${code}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    // Its answer for a code it has never seen is a 404 with status 0.
    if (res.status === 404) return { outcome: 'unknown', food: null };
    if (!res.ok) return { outcome: 'failed', food: null };
    const body = await res.json();     // the rate-limit page is HTML: throws, so failed
    const p = body?.product;
    if (body?.status !== 1 || !p?.product_name) return { outcome: 'unknown', food: null };

    const brand = String(p.brands ?? '').split(',')[0].trim();
    const quantity = String(p.quantity ?? '').trim();
    // "Koo Baked beans in tomato sauce 410 g": brand first unless the
    // name already starts with it, then the pack size.
    const base = brand && !p.product_name.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${p.product_name}` : p.product_name;
    const tags = (p.categories_tags ?? []).map((tag) => String(tag).replace(/^[a-z]{2}:/, '')).filter(Boolean);
    return {
      outcome: 'found',
      food: {
        name: [base, quantity].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
        productName: String(p.product_name).trim(),
        brand: brand || null,
        quantity: quantity || null,
        weightKg: weightKgOf(p.product_quantity, p.product_quantity_unit),
        category: categoryLabel(tags.at(-1)) || null,
        categories: tags,
      },
    };
  } catch (err) {
    console.error('[openFoodFacts] no answer:', err.name === 'AbortError' ? 'timed out' : err.message);
    return { outcome: 'failed', food: null };
  } finally {
    clearTimeout(timer);
  }
};

// The food, or null for unknown and failed alike: for a screen asking
// now, both mean "no suggestion".
export const lookupProduct = async (code) => (await fetchProduct(code)).food;

export default { lookupProduct, fetchProduct, isEnabled, setFetch };
