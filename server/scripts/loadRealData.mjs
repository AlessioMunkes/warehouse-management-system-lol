#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/loadRealData.mjs
//
// Loads two of the warehouse's own documents (docs/real-data) into a
// running system:
//
//   ECD SUMMER MENU with quantities.pdf        -> the Summer recipe
//   Ladles_of_Love_CapeTown_Stock_Report.xlsx  -> the catalogue and the
//                                                 stock on hand
//
// It goes through the app's own API, signed in as an admin, rather than
// writing to the database: the recipe is validated the way Settings →
// Recipes validates it, and every change to stock is a manual adjustment
// with its row in the stock ledger.
//
//   WMS_ADMIN_USER=…  WMS_ADMIN_PASSWORD=…  node scripts/loadRealData.mjs --dry-run
//   WMS_ADMIN_USER=…  WMS_ADMIN_PASSWORD=…  node scripts/loadRealData.mjs
//
//   WMS_BASE_URL       where the API is (default http://localhost:5000)
//   --dry-run          print what would happen and change nothing
//   --replace-recipe   overwrite a Summer recipe that already has lines
//
// Safe to run twice: a product already in the catalogue is left alone, a
// Summer recipe that has lines is left alone, and a product that already
// carries this stock count in its ledger is not counted again.
//
// THE SUMMER MENU
// The menu gives each day's ingredients for 25 servings. A recipe line is
// what ONE child gets in a week, so each figure below is the week's total
// for 25 (Monday to Friday plus the daily snack recipe, once) and is
// divided by 25 when it is sent. Where the menu's table and its
// ingredient list disagree, the comments say which was used.
//
// THE STOCK REPORT
// The report has no units. Dry goods are taken as kilograms, cans and
// jars as each, oil as litres — the units the catalogue already keeps
// them in. The count loaded is the report's last one, 31 July 2026.
// Lines the report shows at zero are left as they are.
// ─────────────────────────────────────────────────────────────

const SERVINGS = 25;

// One week for 25 children.
const SUMMER_MENU_PER_25 = [
  { product: 'Maize meal',    quantity: 1,     unit: 'kg' },   // Mon
  { product: 'Lentils',       quantity: 0.8,   unit: 'kg' },   // Mon 600 g + Fri 200 g (Friday's 50/75/100 columns say "kg"; a typo)
  { product: 'Carrots',       quantity: 1.45,  unit: 'kg' },   // Mon 300, Wed 300, Thu 200, Fri 400, snack 250
  { product: 'Leeks',         quantity: 0.5,   unit: 'kg' },   // Mon 150, Tue 200, Fri 150
  { product: 'Butternut',     quantity: 0.4,   unit: 'kg' },   // Mon
  { product: 'Spinach',       quantity: 0.45,  unit: 'kg' },   // Mon, Tue, Wed 150 each
  { product: 'Spring Onion',  quantity: 0.3,   unit: 'kg' },   // Mon 100, Wed 100, Fri 100 (Friday's is in the ingredient list, not its table)
  { product: 'Salt',          quantity: 0.065, unit: 'kg' },   // Mon 15, Tue 10, Wed 15, Thu 10, Fri 10, snack 5
  { product: 'Rice',          quantity: 2,     unit: 'kg' },   // Tue, Fri
  { product: 'Baked Beans',   quantity: 3,     unit: 'each' }, // Tue, 3 cans
  { product: 'Samp',          quantity: 1,     unit: 'kg' },   // Wed
  { product: 'Pilchards',     quantity: 3,     unit: 'each' }, // Wed, 3 cans
  { product: 'Cabbage',       quantity: 1.5,   unit: 'kg' },   // Wed
  { product: 'Onions',        quantity: 0.7,   unit: 'kg' },   // Wed 400, Thu 100, Fri 200
  { product: 'Soya mince',    quantity: 0.3,   unit: 'kg' },   // Thu
  { product: 'Potatoes',      quantity: 0.9,   unit: 'kg' },   // Thu
  { product: 'Tomatoes',      quantity: 0.2,   unit: 'kg' },   // Thu
  { product: 'Oats',          quantity: 0.56,  unit: 'kg' },   // snack 360 + Fri patties 200 (in the ingredient list, not the table)
  { product: 'Sugar',         quantity: 0.025, unit: 'kg' },   // snack
  // The menu's tables keep oil the same for 25 and for 100 children. It
  // is scaled here like everything else, from the 25-serving figure.
  { product: 'Cooking Oil',   quantity: 0.33,  unit: 'l' },    // Mon 60, Tue 45, Wed 60, Thu 45, Fri 120 ml
  // Cumin (Tue 5 g, Thu 5 g) and cinnamon (snack 10 g): the catalogue
  // has one line for spices.
  { product: 'Spices (Misc)', quantity: 0.02,  unit: 'kg' },
];

// Lines the stock report tracks that the catalogue did not have. SKUs
// follow the placeholder scheme of seedWesternCapeSupply.mjs.
const NEW_PRODUCTS = [
  { name: 'Noodles',                      sku: 'WC-NOODLES',           unit: 'kg',   category: 'Dry Goods',    perishable: false },
  { name: 'Pasta',                        sku: 'WC-PASTA',             unit: 'kg',   category: 'Dry Goods',    perishable: false },
  { name: 'Split Peas Green',             sku: 'WC-SPLIT-PEAS-GREEN',  unit: 'kg',   category: 'Dry Goods',    perishable: false },
  { name: 'Split Peas Yellow',            sku: 'WC-SPLIT-PEAS-YELLOW', unit: 'kg',   category: 'Dry Goods',    perishable: false },
  { name: 'Samp & Beans',                 sku: 'WC-SAMP-BEANS',        unit: 'kg',   category: 'Dry Goods',    perishable: false },
  { name: 'Barley',                       sku: 'WC-BARLEY',            unit: 'kg',   category: 'Dry Goods',    perishable: false },
  { name: 'Pumpkin',                      sku: 'WC-PUMPKIN',           unit: 'kg',   category: 'Vegetables',   perishable: true  },
  { name: 'Tomato Pulp',                  sku: 'WC-TOMATO-PULP',       unit: 'each', category: 'Canned Goods', perishable: false },
  { name: 'LOL Cans',                     sku: 'WC-LOL-CANS',          unit: 'each', category: 'Canned Goods', perishable: false },
  { name: 'Cranberry Split Beans (jars)', sku: 'WC-CRANBERRY-BEANS',   unit: 'each', category: 'Dry Goods',    perishable: false },
  { name: 'Bucket/Jars of Hope',          sku: 'WC-JARS-OF-HOPE',      unit: 'each', category: 'Dry Goods',    perishable: false },
];

// The report's count of 31 July 2026, against the catalogue's name.
const STOCK_COUNT = [
  { product: 'Cooking Oil',                  quantity: 432,    unit: 'l' },
  { product: 'Noodles',                      quantity: 1000,   unit: 'kg' },
  { product: 'Maize meal',                   quantity: 4205,   unit: 'kg' },
  { product: 'Pasta',                        quantity: 99,     unit: 'kg' },
  { product: 'Pilchards',                    quantity: 3973,   unit: 'each' },
  { product: 'Samp',                         quantity: 2500,   unit: 'kg' },
  { product: 'Soya mince',                   quantity: 2649,   unit: 'kg' },
  { product: 'Split Peas Green',             quantity: 5128,   unit: 'kg' },
  { product: 'Sugar',                        quantity: 931.5,  unit: 'kg' },
  { product: 'Salt',                         quantity: 1104.5, unit: 'kg' },
  { product: 'Oats',                         quantity: 2758,   unit: 'kg' },
  { product: 'Rice',                         quantity: 4709,   unit: 'kg' },
  { product: 'Baked Beans',                  quantity: 4709,   unit: 'each' },
  { product: 'Cranberry Split Beans (jars)', quantity: 4294,   unit: 'each' },
];
const STOCK_REASON = 'Stock count correction — stock report, count of 31 July 2026';

const BASE = (process.env.WMS_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const DRY = process.argv.includes('--dry-run');
const REPLACE_RECIPE = process.argv.includes('--replace-recipe');
const { WMS_ADMIN_USER: username, WMS_ADMIN_PASSWORD: password } = process.env;
if (!username || !password) {
  console.error('Set WMS_ADMIN_USER and WMS_ADMIN_PASSWORD to an admin sign-in.');
  process.exit(1);
}

let cookie = '';
const call = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.message || ''}`.trim());
  return json.data ?? json;
};
const key = (name) => String(name).trim().toLowerCase();
const round6 = (n) => Math.round(n * 1e6) / 1e6;

await call('POST', '/api/login', { username, password });
console.log(`${DRY ? 'DRY RUN — nothing will change.' : 'Loading real data.'}  API: ${BASE}`);

// ── 1. The catalogue ──────────────────────────────────────────
console.log('\nCATALOGUE');
let products = await call('GET', '/api/products');
let byName = new Map(products.map((p) => [key(p.name), p]));
for (const product of NEW_PRODUCTS) {
  if (byName.has(key(product.name))) { console.log(`  have    ${product.name}`); continue; }
  console.log(`  add     ${product.name.padEnd(30)} ${product.unit.padEnd(5)} ${product.category}`);
  if (DRY) continue;
  await call('POST', '/api/products', {
    name: product.name, stockKeepingUnit: product.sku, defaultUnit: product.unit,
    category: product.category, isPerishable: product.perishable,
  });
}
if (!DRY) {
  products = await call('GET', '/api/products');
  byName = new Map(products.map((p) => [key(p.name), p]));
}

const manifest = await call('GET', '/api/stock');
const stockById = new Map(manifest.map((row) => [row.id, row]));

// ── 2. The Summer recipe ──────────────────────────────────────
console.log('\nSUMMER RECIPE (per child, per week)');
const overview = await call('GET', '/api/recipes');
const summer = overview.recipes.find((r) => r.kind === 'summer');
if (!summer) throw new Error('This system has no Summer recipe. Run the migrations first.');

const lines = [];
for (const item of SUMMER_MENU_PER_25) {
  const product = byName.get(key(item.product));
  if (!product) { console.log(`  SKIP    ${item.product} — not in the catalogue`); continue; }
  const quantityPerChild = round6(item.quantity / SERVINGS);
  const stockUnit = stockById.get(product.id)?.unit;
  const note = stockUnit && stockUnit !== item.unit ? `   [stock is kept in ${stockUnit}]` : '';
  console.log(`  ${item.product.padEnd(15)} ${String(quantityPerChild).padStart(8)} ${item.unit.padEnd(5)} (${item.quantity} ${item.unit} for ${SERVINGS})${note}`);
  lines.push({ productId: product.id, quantityPerChild, unit: item.unit });
}
if (summer.lines.length && !REPLACE_RECIPE) {
  console.log(`  The Summer recipe already has ${summer.lines.length} line(s). Left as it is; pass --replace-recipe to overwrite.`);
} else if (!DRY) {
  await call('PUT', `/api/recipes/${summer.id}`, { lines });
  console.log(`  Saved ${lines.length} line(s).`);
}

// ── 3. Stock on hand ──────────────────────────────────────────
console.log('\nSTOCK ON HAND (count of 31 July 2026)');
for (const item of STOCK_COUNT) {
  const product = byName.get(key(item.product));
  if (!product) { console.log(`  ${DRY ? 'new     ' : 'SKIP    '}${item.product.padEnd(30)} ${item.quantity} ${item.unit}${DRY ? '' : ' — not in the catalogue'}`); continue; }
  const row = stockById.get(product.id);
  const onHand = Number(row?.quantity_on_hand ?? 0);
  if (row?.unit && row.unit !== item.unit) {
    console.log(`  SKIP    ${item.product.padEnd(30)} stock is kept in ${row.unit}, the count is in ${item.unit}`);
    continue;
  }
  const history = await call('GET', `/api/stock/${product.id}/history`);
  if (history.some((m) => m.reason === STOCK_REASON)) { console.log(`  counted ${item.product.padEnd(30)} already loaded, now ${onHand} ${item.unit}`); continue; }
  const delta = round6(item.quantity - onHand);
  if (delta === 0) { console.log(`  same    ${item.product.padEnd(30)} ${onHand} ${item.unit}`); continue; }
  console.log(`  set     ${item.product.padEnd(30)} ${String(onHand).padStart(7)} -> ${String(item.quantity).padStart(7)} ${item.unit}  (${delta > 0 ? '+' : ''}${delta})`);
  if (DRY) continue;
  await call('POST', '/api/stock/adjust', { productId: product.id, quantityDelta: delta, unit: item.unit, reason: STOCK_REASON });
}

console.log(DRY ? '\nDry run finished. Nothing was changed.' : '\nDone.');
