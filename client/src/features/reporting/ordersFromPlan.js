// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ordersFromPlan.js
//
// The orders the reorder planner's suggestions make, for Create
// purchase orders (CreateOrdersFromPlan.jsx): one per supplier, and the
// products with no supplier to order from.
// ─────────────────────────────────────────────────────────────
const todayInSAST = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The orders the plan's lines make: one per supplier, and what has none. */
export const ordersFromPlan = (items, today = todayInSAST()) => {
  const wanted = items.filter((i) => Number(i.suggestedQuantity) > 0);
  const bySupplier = new Map();
  for (const item of wanted.filter((i) => i.supplierId)) {
    const group = bySupplier.get(item.supplierId) ?? { supplierId: item.supplierId, supplier: item.supplier, lines: [] };
    group.lines.push(item);
    bySupplier.set(item.supplierId, group);
  }
  const orders = [...bySupplier.values()].map((g) => ({
    ...g,
    // Due when the slowest of its products should arrive; never today.
    expectedDeliveryDate: addDays(today, Math.max(1, ...g.lines.map((l) => Number(l.leadDays) || 0))),
  }));
  return { orders, noSupplier: wanted.filter((i) => !i.supplierId) };
};
