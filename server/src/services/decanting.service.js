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
// Standard bag sizes in kg, largest first. These are the options
// offered to the user; they tick the ones they want to use.
const STANDARD_BAG_SIZES_KG = [5, 2.5, 1, 0.5, 0.25];

// Bags may not exceed 5 kg (handling limit) — applies to custom
// sizes too.
const MAX_BAG_SIZE_KG = 5;

// Objective: the bag combination must land within 0.5 % of the
// required weight (Decanting Calculator system objective).
const MARGIN_OF_ERROR = 0.005;

// ── Pure helper: human label for a bag size ───────────────────
// 5 → "5kg", 2.5 → "2.5kg", 0.5 → "500g", 0.25 → "250g".
const bagLabel = (kg) =>
  kg >= 1 ? `${parseFloat(kg.toFixed(3))}kg` : `${Math.round(kg * 1000)}g`;

// ── Pure helper: validate + normalise the chosen bag sizes ────
// selectedSizes — array of kg values the user ticked (subset of the
//                 standard sizes). Defaults to all standard sizes.
// customSizeKg  — an optional custom bag size the user typed in.
// Returns a de-duplicated, descending list of sizes in kg.
const resolveSizes = (selectedSizes, customSizeKg) => {
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

  // De-duplicate and sort largest-first.
  const unique = [...new Set(sizes)].sort((a, b) => b - a);
  if (unique.length === 0)
    throw new Error('At least one bag size must be selected.');

  return unique;
};

// ── Pure helper: split a target weight into the chosen bags ───
// Greedy, largest-first cascade across the selected sizes
// (e.g. 5 kg → 2.5 kg → 1 kg → 500 g → 250 g, or whatever subset the
// user picked). Returns the bag counts and the exact packed weight.
const splitIntoBags = (targetKg, sizesKg) => {
  const sizes  = [...sizesKg].sort((a, b) => b - a); // largest first
  const counts = {};
  let remaining = targetKg;

  for (const kg of sizes) {
    const label = bagLabel(kg);
    const n = Math.floor((remaining + 1e-9) / kg); // epsilon guards float drift
    counts[label] = n;
    remaining -= n * kg;
  }

  const packedKg = sizes.reduce(
    (sum, kg) => sum + counts[bagLabel(kg)] * kg,
    0
  );

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

  if (!Number.isFinite(required) || required <= 0)
    throw new Error(`Required weight for "${productName || productId}" must be a positive number.`);

  // Resolve which bag sizes to use — per-item choice wins, else the
  // plan-level default, else all standard sizes.
  const sizesKg = resolveSizes(
    item.selectedSizes ?? defaults.selectedSizes,
    item.customSizeKg  ?? defaults.customSizeKg
  );

  // Round the target to the nearest multiple of the smallest chosen
  // bag, then cascade-fill from the largest.
  const smallest = Math.min(...sizesKg);
  const targetKg = Math.round(required / smallest) * smallest;
  const { counts, packedKg } = splitIntoBags(targetKg, sizesKg);

  const totalBags    = Object.values(counts).reduce((a, b) => a + b, 0);
  const marginError  = Math.abs(packedKg - required) / required;
  const withinMargin = marginError <= MARGIN_OF_ERROR;

  const plan = {
    productId:   productId ?? null,
    productName: productName ?? null,
    requiredKg:  round3(required),
    sizesKg,                        // sizes used, descending
    bags:        counts,            // { '5kg': n, '2.5kg': n, '1kg': n, ... }
    totalBags,
    packedKg:    round3(packedKg),
    marginError: round4(marginError),  // fraction, e.g. 0.0032 = 0.32 %
    withinMargin,
  };

  // If bulk weight is supplied, work out surplus / shortfall so the
  // procurement report knows what is left over or short.
  if (actualBulkKg !== undefined && actualBulkKg !== null && actualBulkKg !== '') {
    const bulk = Number(actualBulkKg);
    if (!Number.isFinite(bulk) || bulk < 0)
      throw new Error(`Actual bulk weight for "${productName || productId}" must be zero or a positive number.`);

    const difference = bulk - packedKg;
    plan.actualBulkKg = round3(bulk);
    plan.surplusKg    = difference > 0 ? round3(difference)  : 0;  // bulk left over
    plan.shortfallKg  = difference < 0 ? round3(-difference) : 0;  // not enough bulk to pack the plan
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
      acc.totalPackedKg    += p.packedKg;
      acc.totalBags        += p.totalBags;
      acc.totalSurplusKg   += p.surplusKg   || 0;
      acc.totalShortfallKg += p.shortfallKg || 0;
      if (!p.withinMargin) acc.linesOverMargin += 1;
      return acc;
    },
    {
      totalRequiredKg: 0, totalPackedKg: 0, totalBags: 0,
      totalSurplusKg: 0, totalShortfallKg: 0, linesOverMargin: 0,
    }
  );

  summary.totalRequiredKg  = round3(summary.totalRequiredKg);
  summary.totalPackedKg    = round3(summary.totalPackedKg);
  summary.totalSurplusKg   = round3(summary.totalSurplusKg);
  summary.totalShortfallKg = round3(summary.totalShortfallKg);

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
  const lines = items.map((item) => {
    const plan = calculatePlanForProduct(item, defaults);

    let wastageKg = 0;
    if (item.wastageKg !== undefined && item.wastageKg !== null && item.wastageKg !== '') {
      wastageKg = Number(item.wastageKg);
      if (!Number.isFinite(wastageKg) || wastageKg < 0)
        throw new Error(`Wastage for "${item.productName || item.productId}" must be zero or a positive number.`);
    }

    return { ...plan, wastageKg: round3(wastageKg), notes: item.notes || null };
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

// ── Get products that are decanted (dry goods) ────────────────
const getDecantableProducts = async () => {
  return await decantingModel.getDecantableProducts();
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
  getDecantableProducts,
  // constants (handy for tests / the frontend)
  STANDARD_BAG_SIZES_KG,
  MAX_BAG_SIZE_KG,
  MARGIN_OF_ERROR,
};