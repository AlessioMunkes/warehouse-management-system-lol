// ─────────────────────────────────────────────────────────────
// server/src/services/decanting.service.js
//
// Business logic for the decanting calculator.
//
// The user chooses which bag sizes to decant into — 5 kg (max),
// 2.5 kg, 1 kg, 500 g, 250 g — or types in their own custom size.
// Given the week's required weight per product, the calculator
// cascades largest-first across the chosen sizes to work out how
// many bags of each to fill, keeps the error under 0.5 % of the
// required weight, and records wastage / surplus for the weekly
// procurement report.
//
// Validates data and enforces rules before touching the DB.
// Calculation logic lives here (domain layer) — the repository only
// persists and retrieves.
// ─────────────────────────────────────────────────────────────
import decantingModel from '../repositories/decanting.repository.js';

// ── Constants ─────────────────────────────────────────────────
// The three bag weights Ladles of Love actually decants into, per
// the sponsor's process email and the Decanting Calculator system
// objective: "500 g, 1 kg, 2 kg".
//
// This previously read [5, 2.5, 1, 0.5, 0.25] — which omitted 2 kg
// (the size they use most) and offered three sizes they do not use.
// That mismatch was the main source of margin-of-error breaches:
// with these three sizes the error is 0 % at every realistic weekly
// weight, because every one is a whole multiple of 500 g.
//
// Other sizes remain available through the custom-size field, so
// nothing is lost if the warehouse starts using a fourth.
const STANDARD_BAG_SIZES_KG = [2, 1, 0.5];

// Bags may not exceed 5 kg (handling limit) — applies to custom
// sizes too.
const MAX_BAG_SIZE_KG = 5;

// Objective: the bag combination must land within 0.5 % of the
// weight being planned (Decanting Calculator system objective).
const MARGIN_OF_ERROR = 0.005;

// A gram is the finest weight the warehouse scale and the bag labels
// distinguish, so every size is normalised to whole grams. This is
// what stops two sizes that differ below a gram (1 kg and 1.0004 kg,
// say, typed into the custom-size box) from rendering the same label
// and silently overwriting each other's bag count.
const GRAMS_PER_KG = 1000;
const toGrams = (kg) => Math.round(kg * GRAMS_PER_KG);

// Guard on the exact-fill search below. Well past any real weekly
// requirement; only reachable with pathological custom sizes.
const MAX_FILL_UNITS = 2_000_000;

// ── Pure helper: human label for a bag size ───────────────────
// 2 → "2kg", 1 → "1kg", 0.5 → "500g", 0.25 → "250g".
const bagLabel = (kg) =>
  kg >= 1 ? `${parseFloat(kg.toFixed(3))}kg` : `${Math.round(kg * GRAMS_PER_KG)}g`;

// ── Pure helper: validate + normalise the chosen bag sizes ────
// selectedSizes — array of kg values the user ticked. Defaults to
//                 all standard sizes.
// customSizeKg  — an optional custom bag size the user typed in.
// Returns a de-duplicated, descending list of sizes in kg.
const resolveSizes = (selectedSizes, customSizeKg) => {
  // An EMPTY array means "nothing ticked", which is not the same as
  // "not specified" — but `??` only falls through on null/undefined,
  // so an empty per-item array used to silently discard the
  // plan-level choice and fall back to all standard sizes.
  // hasSizes() is used at both levels to normalise that away.
  let sizes =
    Array.isArray(selectedSizes) && selectedSizes.length
      ? selectedSizes.map(Number)
      : [...STANDARD_BAG_SIZES_KG];

  // Fold in a custom size if the user entered one.
  if (customSizeKg !== undefined && customSizeKg !== null && customSizeKg !== '') {
    sizes.push(Number(customSizeKg));
  }

  // Validate every size.
  for (const kg of sizes) {
    if (!Number.isFinite(kg) || kg <= 0)
      throw new Error('Bag sizes must be positive numbers.');
    if (kg > MAX_BAG_SIZE_KG)
      throw new Error(`Bag size cannot exceed ${MAX_BAG_SIZE_KG} kg.`);
  }

  // Normalise to whole grams BEFORE de-duplicating, so sizes that
  // are indistinguishable on the warehouse floor collapse into one
  // instead of colliding later on their shared label.
  const normalised = sizes.map((kg) => toGrams(kg) / GRAMS_PER_KG);

  const unique = [...new Set(normalised)].sort((a, b) => b - a);
  if (unique.length === 0)
    throw new Error('At least one bag size must be selected.');

  return unique;
};

// ── Greatest common divisor, for the fill search below ────────
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

// ── Pure helper: split a target weight into the chosen bags ───
// Finds the combination of the selected sizes whose total weight is
// CLOSEST to the target.
//
// This replaces a greedy largest-first cascade. Greedy is only
// correct when each size divides the next, and 2.5 kg does not
// divide 1 kg — so asking for 4 kg from [2.5, 1] returned
// 1x2.5 + 1x1 = 3.5 kg (12.5 % error) when 4x1 hits it exactly.
// The full default set hid this because 500 g and 250 g mopped up
// the remainder; unticking the two smallest sizes exposed it.
//
// The search runs in units of the greatest common divisor of the
// sizes, which keeps it tiny for real inputs (sizes [2, 1, 0.5]
// over a 200 kg requirement is 400 steps, not 200 000).
// maxKg is a HARD ceiling the total may never cross. The search
// otherwise picks the closest total to the target, which may sit
// slightly above it (up to half the smallest bag, matching the
// original rounding behaviour). That is fine when the target is the
// weekly requirement, but not when it is the weighed bulk bag: you
// cannot pack more than is physically in the sack.
const splitIntoBags = (targetKg, sizesKg, maxKg = Infinity) => {
  const sizes  = [...sizesKg].sort((a, b) => b - a); // largest first
  const counts = {};
  for (const kg of sizes) counts[bagLabel(kg)] = 0;

  const sizesG  = sizes.map(toGrams);
  const targetG = toGrams(targetKg);
  if (targetG <= 0 || sizesG.length === 0) return { counts, packedKg: 0 };

  const unit = sizesG.reduce((a, b) => gcd(a, b));

  // Search one unit past the target so a combination that slightly
  // OVERSHOOTS can win when it is closer than anything below.
  const upperUnits = Math.ceil(targetG / unit);
  if (upperUnits > MAX_FILL_UNITS) return splitIntoBagsGreedy(targetKg, sizes);
  if (upperUnits <= 0) return { counts, packedKg: 0 };

  const sizeUnits = sizesG.map((g) => g / unit);

  // minBags[u] = fewest bags summing to exactly u units, -1 if that
  // total cannot be made. choice[u] = index of a size used to reach it.
  const minBags = new Int32Array(upperUnits + 1).fill(-1);
  const choice  = new Int32Array(upperUnits + 1).fill(-1);
  minBags[0] = 0;

  for (let u = 1; u <= upperUnits; u++) {
    for (let i = 0; i < sizeUnits.length; i++) {
      const prev = u - sizeUnits[i];
      if (prev < 0 || minBags[prev] < 0) continue;
      if (minBags[u] < 0 || minBags[prev] + 1 < minBags[u]) {
        minBags[u] = minBags[prev] + 1;
        choice[u]  = i;
      }
    }
  }

  // Pick the reachable total closest to the target, never crossing
  // maxKg. Ties go to the LOWER total: overshooting spends bulk the
  // warehouse may not have.
  const maxG = Number.isFinite(maxKg) ? toGrams(maxKg) : Infinity;
  let bestU = 0;
  let bestDistance = Math.abs(targetG);
  for (let u = 0; u <= upperUnits; u++) {
    if (minBags[u] < 0) continue;
    if (u * unit > maxG) break;
    const distance = Math.abs(u * unit - targetG);
    if (distance < bestDistance) { bestDistance = distance; bestU = u; }
  }

  let u = bestU;
  let packedG = 0;
  while (u > 0) {
    const i = choice[u];
    counts[bagLabel(sizes[i])] += 1;
    packedG += sizesG[i];
    u -= sizeUnits[i];
  }

  return { counts, packedKg: packedG / GRAMS_PER_KG };
};

// Fallback for pathological custom sizes only (see MAX_FILL_UNITS).
// Same greedy cascade as before: fast, but not always optimal.
const splitIntoBagsGreedy = (targetKg, sizesKg) => {
  const sizes  = [...sizesKg].sort((a, b) => b - a);
  const counts = {};
  let remaining = targetKg;

  for (const kg of sizes) {
    const n = Math.floor((remaining + 1e-9) / kg);
    counts[bagLabel(kg)] = n;
    remaining -= n * kg;
  }

  const packedKg = sizes.reduce((sum, kg) => sum + counts[bagLabel(kg)] * kg, 0);
  return { counts, packedKg };
};

// ── Rounding helpers (keep weights tidy, avoid float noise) ───
const round3 = (n) => Math.round(n * 1000) / 1000;
const round4 = (n) => Math.round(n * 10000) / 10000;

// ── Pure helper: build the plan for a single product ──────────
// item     — { productId, productName, requiredKg, actualBulkKg?,
//              selectedSizes?, customSizeKg? }
// defaults — plan-level { selectedSizes, customSizeKg } used when the
//            item doesn't carry its own choice.
const calculatePlanForProduct = (item, defaults = {}) => {
  const { productId, productName, requiredKg, actualBulkKg } = item;
  const required = Number(requiredKg);
  const label    = productName || productId;

  if (!Number.isFinite(required) || required <= 0)
    throw new Error(`Required weight for "${label}" must be a positive number.`);

  // Resolve which bag sizes to use — per-item choice wins, else the
  // plan-level default, else all standard sizes. hasSizes() is used
  // rather than `??` so an EMPTY per-item array falls back to the
  // plan-level choice instead of silently discarding it.
  const hasSizes = (v) => Array.isArray(v) && v.length > 0;
  const sizesKg = resolveSizes(
    hasSizes(item.selectedSizes) ? item.selectedSizes : defaults.selectedSizes,
    item.customSizeKg ?? defaults.customSizeKg
  );

  // ── How much bulk is actually available? ────────────────────
  // The sponsor's core complaint is that bulk bags often weigh less
  // than labelled, which is why the team weighs them. So the weighed
  // figure has to CONSTRAIN the plan, not just annotate it.
  //
  // Previously the bag counts came from `required` alone and the
  // bulk weight was only subtracted afterwards to report a shortfall
  // — so with 20 kg in the sack against a 50 kg requirement the
  // system still instructed the team to fill 50 kg of bags.
  const hasBulk = actualBulkKg !== undefined && actualBulkKg !== null && actualBulkKg !== '';
  let bulk = null;

  if (hasBulk) {
    bulk = Number(actualBulkKg);
    if (!Number.isFinite(bulk) || bulk < 0)
      throw new Error(`Actual bulk weight for "${label}" must be zero or a positive number.`);
  }

  // ── Wastage comes off the top ───────────────────────────────
  // Wastage is measured AFTER the run, so it is only present when
  // recording (never on a preview). Spillage cannot end up in a bag,
  // so it reduces the bulk available to pack from. Modelling it here
  // rather than validating it afterwards makes the sheet's accounting
  // identity true by construction:
  //     packed + wastage + surplus = bulk
  let wastageKg = 0;
  if (item.wastageKg !== undefined && item.wastageKg !== null && item.wastageKg !== '') {
    wastageKg = Number(item.wastageKg);
    if (!Number.isFinite(wastageKg) || wastageKg < 0)
      throw new Error(`Wastage for "${label}" must be zero or a positive number.`);
    if (hasBulk && wastageKg > bulk)
      throw new Error(
        `Wastage for "${label}" (${round3(wastageKg)} kg) cannot exceed ` +
        `the bulk bag weight (${round3(bulk)} kg).`
      );
  }

  const usableKg = hasBulk ? bulk - wastageKg : Infinity;

  // Plan against whichever is smaller: what is needed, or what there
  // physically is to pack.
  const isBulkLimited = hasBulk && usableKg < required;
  const basisKg       = isBulkLimited ? usableKg : required;

  const smallest = Math.min(...sizesKg);

  // A usable weight of zero is a real, reportable outcome — the sack
  // never arrived, was empty, or was entirely spoiled. It yields an
  // honest zero-bag plan with the whole requirement as shortfall,
  // not an error.
  // A NON-zero weight too small to fill even half a bag is different:
  // that is a data-entry or bag-size mistake, and it used to produce
  // a silent "0 bags, 0 kg packed, 100 % error" plan.
  if (basisKg > 0 && basisKg < smallest / 2) {
    throw new Error(
      `Weight to decant for "${label}" (${round3(basisKg)} kg) must be at least half the ` +
      `smallest selected bag size (${bagLabel(smallest)}).`
    );
  }

  // Cap at the usable bulk: no combination of bags may total more
  // than what is physically left in the sack after wastage.
  const { counts, packedKg } = splitIntoBags(basisKg, sizesKg, usableKg);

  const totalBags = Object.values(counts).reduce((a, b) => a + b, 0);

  // Margin is measured against the weight being PLANNED, not against
  // `required`, so it stays a measure of how well the bag maths hits
  // its target. A short or spoiled sack is a supply problem and is
  // reported separately as shortfallKg — folding it into marginError
  // would make every bad delivery look like a calculator failure.
  //
  // Guard the divide: a zero basis (empty sack) would give NaN, and
  // NaN <= MARGIN_OF_ERROR is false, so the line would be flagged
  // with a meaningless error figure.
  const marginBasis  = basisKg > 0 ? basisKg : required;
  const marginError  = Math.abs(packedKg - marginBasis) / marginBasis;
  const withinMargin = marginError <= MARGIN_OF_ERROR;

  const plan = {
    productId:   productId ?? null,
    productName: productName ?? null,
    requiredKg:  round3(required),
    sizesKg,                        // sizes used, descending
    bags:        counts,            // { '2kg': n, '1kg': n, '500g': n }
    totalBags,
    plannedKg:   round3(basisKg),      // what this line set out to pack
    packedKg:    round3(packedKg),
    marginError: round4(marginError),  // fraction, e.g. 0.0032 = 0.32 %
    withinMargin,
    wastageKg:   round3(wastageKg),
    isBulkLimited,                  // preview-only flag, not persisted
    // Shortfall is measured against the REQUIREMENT — what the ECDs
    // were due but will not receive. It used to mean "the bulk did
    // not cover the plan", which read zero whenever the plan had
    // already been cut down to fit the sack, hiding the very gap
    // procurement needs to see.
    shortfallKg: required > packedKg ? round3(required - packedKg) : 0,
    surplusKg:   0,
  };

  if (hasBulk) {
    plan.actualBulkKg = round3(bulk);        // the real weighed figure
    // Whatever is left in the sack once the bags are filled and the
    // waste is accounted for.
    const leftover  = bulk - packedKg - wastageKg;
    plan.surplusKg  = leftover > 0 ? round3(leftover) : 0;
  }

  return plan;
};

// ─────────────────────────────────────────────────────────────
// Service methods
// ─────────────────────────────────────────────────────────────

// ── Calculate a decanting plan (no persistence) ──────────────
// Called by the Decanting UI to preview bag counts before the team
// commits. The chosen sizes can be set once for the whole plan and/or
// overridden per line.
// data = {
//   selectedSizes?: [5, 2.5, 1],     // plan-level default (optional)
//   customSizeKg?:  0.75,            // plan-level custom size (optional)
//   items: [{ productId, productName, requiredKg, actualBulkKg?,
//             selectedSizes?, customSizeKg? }]
// }
const calculateDecantingPlan = (data) => {
  const items = data?.items;
  if (!Array.isArray(items) || items.length === 0)
    throw new Error('At least one product line is required to calculate a decanting plan.');

  const defaults = {
    selectedSizes: data.selectedSizes,
    customSizeKg:  data.customSizeKg,
  };

  const plans = items.map((item) => calculatePlanForProduct(item, defaults));

  // Roll-up totals for the whole plan.
  const summary = plans.reduce(
    (acc, p) => {
      acc.totalRequiredKg  += p.requiredKg;
      acc.totalPlannedKg   += p.plannedKg;
      acc.totalPackedKg    += p.packedKg;
      acc.totalBags        += p.totalBags;
      acc.totalSurplusKg   += p.surplusKg   || 0;
      acc.totalShortfallKg += p.shortfallKg || 0;
      if (!p.withinMargin) acc.linesOverMargin += 1;
      return acc;
    },
    {
      totalRequiredKg: 0, totalPlannedKg: 0, totalPackedKg: 0, totalBags: 0,
      totalSurplusKg: 0, totalShortfallKg: 0, linesOverMargin: 0,
    }
  );

  summary.totalRequiredKg  = round3(summary.totalRequiredKg);
  summary.totalPlannedKg   = round3(summary.totalPlannedKg);
  summary.totalPackedKg    = round3(summary.totalPackedKg);
  summary.totalSurplusKg   = round3(summary.totalSurplusKg);
  summary.totalShortfallKg = round3(summary.totalShortfallKg);

  // ── The objective's actual measure ───────────────────────────
  // The Decanting Calculator objective reads "a margin of error not
  // exceeding 0.5 % of TOTAL required weight". Only the per-line
  // figure existed, which is a stricter and — below about 40 kg a
  // line — physically unreachable test: with 500 g as the finest
  // bag the best possible error is 0.25 kg / required, so a 20 kg
  // line can be 1.25 % out no matter how good the arithmetic is.
  //
  // Rounding errors are as likely to go up as down, so they largely
  // cancel across a week's lines. Measuring the total is both what
  // the objective specifies and what the calculator can actually be
  // held to. linesOverMargin is kept as a per-line warning signal.
  // Measured against what the run PLANNED to pack, not against what
  // the ECDs required — the same separation the per-line figure makes.
  // A sack that arrived light is a supply problem and is reported as
  // totalShortfallKg; folding it in here would make every short
  // delivery look like a calculator failure.
  summary.marginError = summary.totalPlannedKg > 0
    ? round4(Math.abs(summary.totalPackedKg - summary.totalPlannedKg) / summary.totalPlannedKg)
    : 0;
  summary.withinMargin = summary.marginError <= MARGIN_OF_ERROR;

  return { plans, summary };
};

// ── Record a completed decanting operation ────────────────────
// Persists the plan plus the real wastage measured after decanting.
// Decanting records are irreversible once saved (per the domain
// key-assumption: "wastage cannot be un-recorded").
// data = {
//   weekOf, notes?, selectedSizes?, customSizeKg?,
//   items: [{ productId, requiredKg, actualBulkKg, selectedSizes?,
//             customSizeKg?, wastageKg?, notes? }]
// }
const recordDecanting = async (data, userId) => {
  const { weekOf, items, notes } = data || {};

  if (!weekOf)                                     throw new Error('Week (weekOf) is required.');
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one decanting line is required.');
  if (!userId)                                     throw new Error('User is required.');

  const defaults = {
    selectedSizes: data.selectedSizes,
    customSizeKg:  data.customSizeKg,
  };

  // Re-run the calculation server-side so the stored plan can't be
  // tampered with by the client, then attach any measured wastage.
  // Re-run the calculation server-side so the stored plan can't be
  // tampered with by the client. Wastage is passed through to the
  // calculation rather than bolted on afterwards, so the bag counts
  // reflect the bulk that was actually available to pack.
  const lines = items.map((item) => {
    const plan = calculatePlanForProduct(item, defaults);
    return { ...plan, notes: item.notes || null };
  });

  return await decantingModel.createDecanting({
    weekOf,
    notes:      notes || null,
    recordedBy: userId,        // comes from JWT — never trusted from frontend
    lines,
  });
};

// ── Get decanting records by date range ───────────────────────
const getDecantingRecords = async (range) => {
  const validRanges = ['today', 'week', 'month', 'all'];
  const safeRange   = validRanges.includes(range) ? range : 'all';
  return await decantingModel.getDecantingRecords(safeRange);
};

// ── Get a single decanting record with its lines ──────────────
const getDecantingById = async (id) => {
  if (!id) throw new Error('Decanting record ID is required.');
  const record = await decantingModel.getDecantingById(id);
  if (!record) throw new Error('Decanting record not found.');
  return record;
};

// ── Weekly procurement report ─────────────────────────────────
// Aggregates wastage, surplus and shortfall per product for a given
// week so procurement can adjust bulk purchasing.
const getWeeklyProcurementReport = async (weekOf) => {
  if (!weekOf) throw new Error('Week (weekOf) is required.');
  return await decantingModel.getWeeklyProcurementReport(weekOf);
};

// ── Turn a bag label back into kg, for ordering CSV columns ───
// "2kg" -> 2, "500g" -> 0.5.
const labelToKg = (label) =>
  label.endsWith('kg')
    ? parseFloat(label)
    : parseFloat(label) / GRAMS_PER_KG;

// ── CSV field escaping ─────────────────────────────────────────
// Wraps a field in quotes (doubling any inner quotes) whenever it
// contains a comma, quote, or newline — the standard CSV escaping
// rule so Excel/Sheets parse the file correctly.
const escapeCsvField = (value) => {
  let str = value === null || value === undefined ? '' : String(value);

  // Staff open these sheets in Excel, which treats a leading = + - @
  // as the start of a FORMULA and evaluates it. A product name or SKU
  // beginning with one of those would run as a formula rather than
  // display as text. Prefixing a single quote makes Excel treat the
  // whole cell as literal text; the quote itself is not displayed.
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;

  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
 
// ── Export a decanting record as a CSV sheet ───────────────────
// Rebuilds one saved decanting run into the same shape as the
// sponsor's original paper/Excel decanting sheet: a header block
// (week, who recorded it, notes) followed by one row per product
// line with its bag split, wastage, surplus and shortfall.
// Returns { filename, csv } — the controller streams `csv` as the
// file body under `filename`.
const exportDecantingSheet = async (id) => {
  const record = await getDecantingById(id); // throws 'not found' if missing
 
  const rows = [];
 
  // ── Header block ───────────────────────────────────────────
  rows.push(['Decanting Sheet']);
  rows.push(['Week Of', record.week_of]);
  rows.push(['Recorded By', record.recorded_by_name || '']);
  rows.push(['Notes', record.notes || '']);
  rows.push([]); // blank separator row
 
  // ── Which bag-size columns does this record actually need? ───
  // The columns used to be hard-coded to 5kg/2.5kg/1kg/500g/250g, so
  // a run decanted into a custom size recorded total_bags: 10 while
  // the per-size columns summed to 9 — the sheet did not reconcile
  // and procurement lost the wastage attribution for that size.
  // Deriving them from the record keeps the row internally consistent
  // whatever sizes were used.
  const sizeColumns = [...new Set(
    record.lines.flatMap((line) => Object.keys(line.bags || {}))
  )].sort((a, b) => labelToKg(b) - labelToKg(a)); // largest first

  // ── Column headers ───────────────────────────────────────────
  rows.push([
    'SKU', 'Product', 'Required (kg)', 'Actual Bulk (kg)', 'Packed (kg)',
    'Bag Sizes Used', ...sizeColumns, 'Total Bags',
    'Margin Error (%)', 'Within Margin', 'Wastage (kg)', 'Surplus (kg)',
    'Shortfall (kg)', 'Line Notes',
  ]);
 
  // ── One row per product line ─────────────────────────────────
  for (const line of record.lines) {
    const bags = line.bags || {};
    rows.push([
      line.sku || '',
      line.product_name || '',
      line.required_kg,
      line.actual_bulk_kg ?? '',
      line.packed_kg,
      (line.sizes_kg || []).join(' / '),
      ...sizeColumns.map((col) => bags[col] ?? 0),
      line.total_bags,
      (Number(line.margin_error) * 100).toFixed(2),
      line.within_margin ? 'Yes' : 'No',
      line.wastage_kg,
      line.surplus_kg,
      line.shortfall_kg,
      line.notes || '',
    ]);
  }
 
  // CRLF line endings — the CSV convention Excel expects
  const csv = rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
 
  return {
    filename: `decanting-sheet-${record.week_of}-${record.id}.csv`,
    csv,
  };
};

export default {
  // exposed for the UI preview + unit testing
  calculateDecantingPlan,
  calculatePlanForProduct,
  splitIntoBags,
  resolveSizes,
  bagLabel,
  // persistence-backed
  recordDecanting,
  getDecantingRecords,
  getDecantingById,
  getWeeklyProcurementReport,
  exportDecantingSheet,

  // constants (handy for tests / the frontend)
  STANDARD_BAG_SIZES_KG,
  MAX_BAG_SIZE_KG,
  MARGIN_OF_ERROR,
};