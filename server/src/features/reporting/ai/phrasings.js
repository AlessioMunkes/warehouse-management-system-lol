// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/ai/phrasings.js
//
// Real ways a Ladles of Love manager asks for a report, each with the
// answer it should reach. The yardstick for question matching:
//   • __tests__/reporting.phrasings.test.js holds the keyword fallback
//     (no AI) to a pass mark, so it can only get better;
//   • scripts/evalReportingQuestions.js puts the same questions to the
//     live model and prints the score.
//
// `expect` is a list of acceptable answers: 'metric_id',
// 'comparison:id' or 'custom:dataset'. Several are allowed where a
// question honestly has more than one right answer.
//
// `holdout: true` marks questions written AFTER the synonyms were
// tuned and never used to tune them — the honest measure of how it
// copes with new phrasing. Once a holdout question has been used to
// fix a miss, it stops being a holdout: move it up and write new ones.
// Add to this file when a real question goes to the wrong report.
// ─────────────────────────────────────────────────────────────
export const PHRASINGS = [
  // ── Dispatch and collections ────────────────────────────────
  { q: 'how much food went out last month', expect: ['dispatch_volume'] },
  { q: 'kilograms dispatched this year', expect: ['dispatch_volume'] },
  { q: 'how much did we send to the centres', expect: ['dispatch_volume'] },
  { q: 'are centres collecting their pallets', expect: ['collection_compliance', 'comparison:centre_collections_vs_children'] },
  { q: 'collection compliance by month', expect: ['collection_compliance'] },
  { q: 'which centres keep missing collections', expect: ['repeat_non_collections'] },
  { q: 'centres that did not collect', expect: ['repeat_non_collections', 'collection_compliance'] },
  { q: 'how many collections were late', expect: ['late_collection_rate', 'custom:collections'] },
  { q: 'collections by outcome', expect: ['custom:collections'] },
  { q: 'how many pallets were not collected last month', expect: ['custom:collections', 'collection_compliance', 'repeat_non_collections'] },

  // ── Picking and decanting ───────────────────────────────────
  { q: 'how many slips are still pending', expect: ['slip_pipeline', 'custom:picking_slips'] },
  { q: 'picking slips by status', expect: ['slip_pipeline', 'custom:picking_slips'] },
  { q: 'which products do packers flag most', expect: ['picking_flag_rate'] },
  { q: 'how long does it take to pack a slip', expect: ['picking_turnaround'] },
  { q: 'is decanting wastage getting worse', expect: ['decanting_wastage'] },
  { q: 'how much do we lose when decanting', expect: ['decanting_wastage', 'decanting_margin_rate'] },
  { q: 'packer workload versus flags', expect: ['comparison:packer_workload_vs_flags'] },

  // ── Receiving and suppliers ─────────────────────────────────
  { q: 'which suppliers deliver the wrong quantities', expect: ['receiving_discrepancy_rate', 'unresolved_discrepancies', 'comparison:supplier_volume_vs_discrepancy'] },
  { q: 'short deliveries by supplier', expect: ['receiving_discrepancy_rate', 'unresolved_discrepancies'] },
  { q: 'open discrepancies that have not been sorted out', expect: ['unresolved_discrepancies'] },
  { q: 'how much stock came in last month', expect: ['goods_received'] },
  { q: 'goods received by supplier', expect: ['goods_received'] },
  { q: 'are suppliers delivering on time', expect: ['po_on_time_rate', 'supplier_lead_time'] },
  { q: 'how long do suppliers take to deliver', expect: ['supplier_lead_time'] },
  { q: 'deliveries by status', expect: ['custom:deliveries'] },
  { q: 'how many deliveries were flagged', expect: ['custom:deliveries', 'receiving_discrepancy_rate'] },

  // ── Procurement ─────────────────────────────────────────────
  { q: 'which purchase orders are overdue', expect: ['overdue_purchase_orders'] },
  { q: 'how much did we spend on suppliers', expect: ['procurement_spend'] },
  { q: 'spend by supplier per month as a stacked chart', expect: ['procurement_spend'] },
  { q: 'which products have gone up in price', expect: ['unit_price_trend'] },
  { q: 'how many purchase orders are in each status', expect: ['custom:purchase_orders', 'purchase_order_pipeline'] },
  { q: 'purchase orders raised this month', expect: ['purchase_order_pipeline', 'custom:purchase_orders'] },
  { q: 'expensive products we buy a lot of', expect: ['comparison:product_price_vs_quantity', 'procurement_spend'] },

  // ── Stock ───────────────────────────────────────────────────
  { q: 'what needs reordering right now', expect: ['low_stock_items'] },
  { q: 'what is running low', expect: ['low_stock_items'] },
  { q: 'how much stock do we have', expect: ['stock_on_hand'] },
  { q: 'what is our stock worth', expect: ['stock_value'] },
  { q: 'what is about to expire', expect: ['expiring_stock'] },
  { q: 'why are there so many stock adjustments', expect: ['adjustment_reasons'] },
  { q: 'stock movements by type', expect: ['stock_movement_volume', 'custom:stock_movements'] },
  { q: 'did the stock count match the system', expect: ['stock_count_variance'] },
  { q: 'how much do centres order each week', expect: ['standing_order_demand'] },

  // ── Donations, community, volunteers ────────────────────────
  { q: 'value of donations this year', expect: ['donation_value'] },
  { q: 'how many section 18a certificates are waiting', expect: ['section18a_pipeline', 'custom:donations'] },
  { q: 'donations by section 18a status', expect: ['section18a_pipeline', 'custom:donations'] },
  { q: 'how were donated items routed', expect: ['donation_routing'] },
  { q: 'benevolent requests by outcome', expect: ['community_request_outcomes', 'custom:community_requests'] },
  { q: 'how quickly do we answer food parcel requests', expect: ['community_response_time'] },
  { q: 'volunteer hours by month', expect: ['volunteer_hours'] },
  { q: 'do volunteers turn up to events', expect: ['volunteer_event_attendance'] },

  // ── Everyday wording (used to tune the synonyms) ────────────
  { q: 'the trucks going out, how much did they carry in august', expect: ['dispatch_volume'] },
  { q: 'who is not fetching their food', expect: ['repeat_non_collections', 'collection_compliance'] },
  { q: 'which vendor keeps sending short', expect: ['receiving_discrepancy_rate', 'unresolved_discrepancies'] },
  { q: 'orders that are late from suppliers', expect: ['overdue_purchase_orders', 'po_on_time_rate'] },
  { q: 'stuff that is about to go off', expect: ['expiring_stock'] },
  { q: 'money spent this month', expect: ['procurement_spend'] },
  { q: 'how much compost came in by status', expect: ['custom:compost'] },
  { q: 'volunteer events by status', expect: ['custom:volunteer_events'] },
  { q: 'how many centres are inactive', expect: ['custom:beneficiaries'] },
  { q: 'bags lost while splitting sacks', expect: ['decanting_wastage'] },

  // ── New diagrams ────────────────────────────────────────────
  { q: 'which day of the week is busiest for dispatch', expect: ['dispatch_volume'] },
  { q: 'when will we run out of maize', expect: ['days_of_cover'] },
  { q: 'how long will our stock last', expect: ['days_of_cover'] },
  { q: 'opening and closing stock waterfall this year', expect: ['stock_flow'] },
  { q: 'where did donated items end up by category', expect: ['donation_routing'] },

  // ── Holdout: written after tuning, never tuned on ───────────
  { q: 'what did we give out to the soup kitchens this month', expect: ['dispatch_volume'], holdout: true },
  { q: 'which ecds never showed up', expect: ['repeat_non_collections', 'collection_compliance'], holdout: true },
  { q: 'suppliers that get the amounts wrong', expect: ['receiving_discrepancy_rate', 'unresolved_discrepancies'], holdout: true },
  { q: 'which items are close to their expiry date', expect: ['expiring_stock'], holdout: true },
  { q: 'how much have we paid for stock this year', expect: ['procurement_spend'], holdout: true },
  { q: 'items we need to order more of', expect: ['low_stock_items'], holdout: true },
  { q: 'how many orders were returned', expect: ['custom:purchase_orders', 'purchase_order_pipeline'], holdout: true },
  { q: 'donor certificates still to send', expect: ['section18a_pipeline', 'custom:donations'], holdout: true },
  { q: 'hours given by volunteers', expect: ['volunteer_hours'], holdout: true },
  { q: 'pallets flagged by packers', expect: ['picking_flag_rate'], holdout: true },
];

/** What a matcher result is, in the `expect` vocabulary. */
export const answerId = (r) => {
  if (!r) return null;
  if (r.kind === 'comparison' || r.type === 'comparison') return `comparison:${r.id}`;
  if (r.kind === 'custom') return `custom:${r.id}`;
  if (r.spec?.custom) return `custom:${r.spec.custom.dataset}`;
  return r.spec?.metric ?? r.id ?? null;
};

export default { PHRASINGS, answerId };
