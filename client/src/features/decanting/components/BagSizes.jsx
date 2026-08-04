// ─────────────────────────────────────────────────────────────
// src/features/decanting/bagSizes.js
//
// One definition of the bag sizes, shared by the Decanting page and
// the per-product row. Both previously kept their own copy of the
// list, so updating one silently left the other offering different
// sizes — which is exactly what happened.
//
// The three weights Ladles of Love actually decants into, per the
// sponsor's process email and the Decanting Calculator objective:
// 500 g, 1 kg, 2 kg. Anything else is still reachable through the
// custom-size field.
//
// These are DISPLAY LABELS. The API speaks kilograms as numbers, so
// everything sent to the backend must go through sizeLabelToKg()
// first — see the note on that function.
// ─────────────────────────────────────────────────────────────

export const STANDARD_SIZES = ['2kg', '1kg', '500g'];

// ── Label -> kilograms ────────────────────────────────────────
// "2kg" -> 2, "500g" -> 0.5.
//
// This conversion was missing entirely: the page sent the labels
// straight through as `selectedSizes`, so the server ran
// Number('2kg') -> NaN and rejected every request with "Bag sizes
// must be positive numbers." POST /api/decanting/calculate could
// never succeed from the UI. Mirrors labelToKg() in
// server/src/services/decanting.service.js.
export const sizeLabelToKg = (label) => {
  if (typeof label === 'number') return label; // already kg
  const value = parseFloat(label);
  if (!Number.isFinite(value)) return NaN;
  return String(label).trim().endsWith('kg') ? value : value / 1000;
};

// Convenience for the request payloads — undefined passes through so
// the backend still falls back to its own defaults.
export const sizesToKg = (labels) =>
  Array.isArray(labels) ? labels.map(sizeLabelToKg) : undefined;