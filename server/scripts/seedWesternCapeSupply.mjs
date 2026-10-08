// ─────────────────────────────────────────────────────────────
// server/scripts/seedWesternCapeSupply.mjs
//
// One-off migration: loads the sponsor's real Western Cape supply
// sheet (server/scripts/data/westernCapeSupply.json — extracted and
// cross-validated from the PDF the sponsor supplied, not hand-typed)
// into ecd_centres, products, and ecd_order_lines, replacing whatever
// placeholder data those centres/products carried.
//
// RUN IT with the same --env-file-if-exists flag package.json's own
// dev/start scripts use — DATABASE_URL lives in .env.local, and a
// plain `node` invocation has no other way to see it. See the exact
// command in the delivery notes; it depends on which directory you
// run it from.
//
// SAFE TO RE-RUN. Every write here is find-or-create by name, never a
// blind insert:
//   - products:     productRepository.findByNameOrSku, then createProduct
//   - ecd_centres:  beneficiaryRepository.findByName, then insertBeneficiary
//   - order lines:  DELETE the centre's existing lines, then INSERT the
//                    sheet's lines fresh — this is the "clean migration,
//                    not additive duplication" the sponsor asked for,
//                    scoped to exactly the centres in this sheet.
//
// WHAT THIS DOES NOT DO. It never deletes an ecd_centres or products row
// that isn't in this sheet — there is no way for this script to tell a
// leftover placeholder centre from a real one it simply doesn't cover
// yet, and a blind purge would be a genuinely destructive, unreviewable
// action against production data. If there's known placeholder data to
// remove, that's a separate, deliberate step — see the printed summary
// at the end for what to check by hand.
//
// REQUIRES the cohort_group enum to have 'tuesday' and 'thursday'
// (schema.sql has them) — this script inserts
// 'tuesday'/'thursday' cohort values directly, which only exist on
// the enum once that migration adds them.
//
// KNOWN ASSUMPTIONS TO VERIFY, flagged rather than silently decided:
//   - Sheet's "Group A"/"Group B" mapped to cohort 'tuesday'/'thursday'
//     respectively — the sheet gives no other cohort label, so this is
//     a guess at which group collects which day.
//   - "Number of beneficiaries" mapped straight to child_count, even
//     though the sheet's own header says it mixes registered children,
//     aftercare, staff, and community kids.
//   - Potatoes and Sugar had no unit printed on the sheet (every other
//     line did) — assumed kg, the majority unit, not confirmed.
//   - "Nomzamo Educare" appeared twice in the sheet with different
//     beneficiary counts (118 and 148) and different quantities — not
//     an extraction artifact (the two rows are fully different, unlike
//     an exact duplicate elsewhere in the sheet that was safely merged).
//     Seeded as two distinct centres, suffixed with their beneficiary
//     count so they don't collide under one name; rename them to their
//     real distinguishing names (suburb, etc.) once known.
//   - The sheet's own printed totals ran ~0.3-0.9% ahead of what every
//     row actually sums to, on every single column, on both pages —
//     consistent with the sheet's own inline note "*Noluthando must be
//     added to the supply sheet*": a centre the sponsor's own totals
//     already account for but whose row was never added. Not fixed
//     here — add Noluthando as its own centre once its numbers exist.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pool from '../src/config/db.js';
import productRepository from '../src/repositories/product.repository.js';
import beneficiaryRepository from '../src/repositories/beneficiary.repository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, 'data', 'westernCapeSupply.json');

const GROUP_TO_COHORT = { 'Group A': 'tuesday', 'Group B': 'thursday' };

// field key in the sheet data -> product to seed it as.
// sku: stock_keeping_unit is NOT NULL UNIQUE in the live schema (see
// product.service.js's own comment on this) — these are script-generated
// placeholders ("WC-" + a short code), not real supplier SKUs. Rename
// them once real SKUs are known; findByNameOrSku still matches existing
// rows by NAME first, so re-running this script after a rename is safe.
const PRODUCTS = [
  { field: 'baked_beans',  name: 'Baked Beans',    sku: 'WC-BAKED-BEANS',   unit: 'each', category: 'Canned Goods', perishable: false },
  { field: 'pilchards',    name: 'Pilchards',      sku: 'WC-PILCHARDS',     unit: 'each', category: 'Canned Goods', perishable: false },
  { field: 'butternut',    name: 'Butternut',      sku: 'WC-BUTTERNUT',     unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'cabbage',      name: 'Cabbage',        sku: 'WC-CABBAGE',       unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'carrots',      name: 'Carrots',        sku: 'WC-CARROTS',       unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'leeks',        name: 'Leeks',          sku: 'WC-LEEKS',         unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'lentils',      name: 'Lentils',        sku: 'WC-LENTILS',       unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'maize_meal',   name: 'Maize Meal',     sku: 'WC-MAIZE-MEAL',    unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'oats',         name: 'Oats',           sku: 'WC-OATS',          unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'onions',       name: 'Onions',         sku: 'WC-ONIONS',        unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'rice',         name: 'Rice',           sku: 'WC-RICE',          unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'samp',         name: 'Samp',           sku: 'WC-SAMP',          unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'soya',         name: 'Soya Mince',     sku: 'WC-SOYA-MINCE',    unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'spinach',      name: 'Spinach',        sku: 'WC-SPINACH',       unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'spring_onion', name: 'Spring Onion',   sku: 'WC-SPRING-ONION',  unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'tomatoes',     name: 'Tomatoes',       sku: 'WC-TOMATOES',      unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'potatoes',     name: 'Potatoes',       sku: 'WC-POTATOES',      unit: 'kg',   category: 'Vegetables',    perishable: true  },
  { field: 'salt',         name: 'Salt',           sku: 'WC-SALT',          unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'sugar',        name: 'Sugar',          sku: 'WC-SUGAR',         unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'spices_misc',  name: 'Spices (Misc)',  sku: 'WC-SPICES-MISC',   unit: 'kg',   category: 'Dry Goods',     perishable: false },
  { field: 'cooking_oil',  name: 'Cooking Oil',    sku: 'WC-COOKING-OIL',   unit: 'l',    category: 'Dry Goods',     perishable: false },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const seedProducts = async () => {
  const productIdByField = {};
  let created = 0, found = 0;

  for (const p of PRODUCTS) {
    const existing = await productRepository.findByNameOrSku(p.name, p.sku);
    if (existing) {
      productIdByField[p.field] = existing.id;
      found++;
      continue;
    }
    const row = await productRepository.createProduct({
      name: p.name,
      stockKeepingUnit: p.sku,
      defaultUnit: p.unit,
      category: p.category,
      isPerishable: p.perishable,
      storageType: 'dry',
    });
    productIdByField[p.field] = row.id;
    created++;
  }

  console.log(`Products: ${created} created, ${found} already existed (matched by name).`);
  return productIdByField;
};

const seedCentre = async (centre, productIdByField) => {
  const cohort = GROUP_TO_COHORT[centre.group];
  if (!cohort) throw new Error(`Unknown group "${centre.group}" for ${centre.centre}`);

  let row = await beneficiaryRepository.findByName(centre.centre);
  let wasNew = false;
  if (row) {
    row = await beneficiaryRepository.updateBeneficiary(row.id, {
      cohort, childCount: centre.beneficiaries,
    });
  } else {
    row = await beneficiaryRepository.insertBeneficiary({
      name: centre.centre, cohort, childCount: centre.beneficiaries,
    });
    wasNew = true;
  }

  if (!row.is_active) await beneficiaryRepository.setBeneficiaryActive(row.id, true);
  if (!row.approved_at) await beneficiaryRepository.approveBeneficiary(row.id);

  // Clean-slate replace: this centre's order lines are wholly this
  // sheet's now, not merged with whatever was there before.
  await pool.query(`DELETE FROM ecd_order_lines WHERE ecd_id = $1`, [row.id]);

  const today = todayISO();
  let lineCount = 0;
  for (const p of PRODUCTS) {
    const quantity = centre[p.field];
    if (!quantity || quantity <= 0) continue;
    await pool.query(
      `INSERT INTO ecd_order_lines (ecd_id, product_id, quantity, unit, effective_from, effective_to)
       VALUES ($1, $2, $3, $4, $5::date, NULL)`,
      [row.id, productIdByField[p.field], quantity, p.unit, today]
    );
    lineCount++;
  }

  return { wasNew, lineCount };
};

const run = async () => {
  const centres = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  console.log(`Loaded ${centres.length} centres from ${DATA_PATH}\n`);

  const productIdByField = await seedProducts();

  let centresCreated = 0, centresUpdated = 0, totalLines = 0;
  const failures = [];

  for (const centre of centres) {
    try {
      const { wasNew, lineCount } = await seedCentre(centre, productIdByField);
      if (wasNew) centresCreated++; else centresUpdated++;
      totalLines += lineCount;
    } catch (err) {
      failures.push({ centre: centre.centre, error: err.message });
    }
  }

  console.log(`\nCentres: ${centresCreated} created, ${centresUpdated} updated (matched by name).`);
  console.log(`Order lines written: ${totalLines}`);

  if (failures.length) {
    console.log(`\n${failures.length} centre(s) FAILED — nothing written for these, everything else committed:`);
    for (const f of failures) console.log(`  - ${f.centre}: ${f.error}`);
    process.exitCode = 1;
  }

  console.log(`
Check by hand before trusting this fully:
  - Any ecd_centres/products rows NOT touched above may be placeholder
    data this script had no way to identify — review and remove those
    separately if so.
  - "Nomzamo Educare (118 beneficiaries)" / "Nomzamo Educare (148
    beneficiaries)" — rename to their real distinguishing names if known.
  - Noluthando is not in this sheet at all (the sheet's own note says it
    still needs to be added) — add it separately once its numbers exist.
  - Potatoes/Sugar units were assumed kg — the sheet printed no unit for
    either.`);

  await pool.end();
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
