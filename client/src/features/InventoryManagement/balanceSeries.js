// ─────────────────────────────────────────────────────────────
// client/src/features/InventoryManagement/balanceSeries.js
//
// Reconstructing a balance history that was never stored.
//
// stock_levels holds ONE number per product: what is on the shelf now.
// There is no table of past balances and there should not be — a second
// copy of a number is a second thing that can be wrong. But
// stock_movements holds every signed change ever applied, so the past
// is recoverable: start from today's on-hand and undo the movements one
// at a time, newest first. The balance a movement left behind is what
// the one before it produced, plus that movement's quantity.
//
// It is therefore only as true as the ledger. A balance corrected
// outside stock_movements would not appear here — which is an argument
// for the reconciliation report, not for drawing something else.
//
// Its own file, not an export beside the chart component:
// react-refresh/only-export-components is an error in this project, so
// a module that exports a component and a function fails the build.
// Same reason shellContext.js and toastContext.js live apart from the
// components that read them.
// ─────────────────────────────────────────────────────────────

// `movements` arrives newest-first (stock.repository orders DESC).
// Returns chronological points, oldest first.
export const buildSeries = (movements, onHand, limit = 40) => {
  if (!Array.isArray(movements) || movements.length === 0) return [];

  const recent = movements.slice(0, limit);
  const points = [];
  let after = Number(onHand ?? 0);

  for (const m of recent) {
    const t = new Date(m.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    // A movement's timestamp carries the balance it RESULTED in.
    points.push({ t, v: after, movement: m });
    after -= Number(m.quantity ?? 0);
  }

  points.reverse();

  // A flat run to "now", so the line ends where the figures above the
  // chart say it does rather than at whenever the last movement was.
  const now = Date.now();
  if (points.length && now > points[points.length - 1].t) {
    points.push({ t: now, v: Number(onHand ?? 0), movement: null });
  }
  return points;
};

export default { buildSeries };
