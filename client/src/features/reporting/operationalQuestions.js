// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/operationalQuestions.js
//
// How the Operations Analytics page groups and suggests its
// reports. Operational metrics only — impact metrics are filtered
// out of the catalog before anything here sees it.
//
// A metric the server adds that is not listed in AREAS still shows,
// under "Other", so the browser never silently hides a report.
// ─────────────────────────────────────────────────────────────

export const AREAS = [
  { id: 'dispatch',    label: 'Dispatch and collections', metrics: ['dispatch_volume', 'collection_compliance', 'repeat_non_collections', 'late_collection_rate', 'gate_load_variance'] },
  { id: 'floor',       label: 'Picking and decanting',    metrics: ['slip_pipeline', 'picking_turnaround', 'picking_flag_rate', 'decanting_wastage', 'decanting_margin_rate'] },
  { id: 'receiving',   label: 'Receiving and suppliers',  metrics: ['goods_received', 'receiving_discrepancy_rate', 'unresolved_discrepancies', 'po_on_time_rate', 'supplier_lead_time'] },
  { id: 'procurement', label: 'Procurement',              metrics: ['overdue_purchase_orders', 'purchase_order_pipeline', 'procurement_spend', 'unit_price_trend'] },
  { id: 'stock',       label: 'Stock',                    metrics: ['low_stock_items', 'stock_on_hand', 'stock_value', 'expiring_stock', 'standing_order_demand', 'stock_movement_volume', 'stock_count_variance', 'adjustment_reasons'] },
  { id: 'people',      label: 'Donations, community and volunteers', metrics: ['donation_value', 'donation_routing', 'section18a_pipeline', 'community_request_outcomes', 'community_response_time', 'volunteer_hours', 'volunteer_event_attendance'] },
];

export const groupByArea = (metrics) => {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const seen = new Set();
  const groups = AREAS.map((a) => {
    const items = a.metrics.map((id) => byId.get(id)).filter(Boolean);
    items.forEach((m) => seen.add(m.id));
    return { ...a, items };
  }).filter((g) => g.items.length);
  const other = metrics.filter((m) => !seen.has(m.id));
  if (other.length) groups.push({ id: 'other', label: 'Other', items: other });
  return groups;
};

// Questions that each lead to a report with a "who to act on" list
// under it, so a first tap shows what the page is for.
export const FEATURED_QUESTIONS = [
  'Which centres keep missing collections?',
  'Which suppliers deliver the wrong quantities?',
  'What needs reordering right now?',
  'Which purchase orders are overdue?',
  'Which products have gone up in price?',
  'Is decanting wastage getting worse?',
  'Which products do packers flag most?',
  'Scatter plot of centres: collections vs children',
  'Show spend by supplier per month as a stacked chart',
];
