// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/insights/operationalInsights.js
//
// What turns an operational chart into something a manager can act
// on. Per metric: which way is good, which related charts explain
// it, which "who to act on" lists sit under it, and the business
// lens its written reading is framed through.
//
// OPERATIONS ONLY. Impact metrics have no entry here and
// reportingInsight.service.js refuses them outright — impact
// reporting is its own page with its own rules (NFR-20) and this
// file must not grow a path into it.
//
// Every list reads from reportingInsight.repository.js. `link` is a
// key the client maps to a route in routes/paths.js, so a path is
// never duplicated here.
// ─────────────────────────────────────────────────────────────
import insightRepo from '../../../repositories/reportingInsight.repository.js';

const fmtDate = (d) => {
  if (!d) return null;
  const iso = d instanceof Date ? d.toISOString() : String(d);
  return iso.slice(0, 10);
};
const fmtNum = (n, digits = 0) =>
  Number(n ?? 0).toLocaleString('en-GB', { maximumFractionDigits: digits });
const rand = (n) => `R${fmtNum(n, 2)}`;
const plural = (n, one, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

const contactOf = (r) => {
  const c = { person: r.contact_name || null, phone: r.contact_phone || null, email: r.contact_email || null };
  return c.person || c.phone || c.email ? c : null;
};

// ── The lists ─────────────────────────────────────────────────
// title:  what the list is.
// intro:  the action, in one sentence — what the manager does with it.
// entry:  one row → { name, detail, contact? }.
export const ACTION_LISTS = {
  missed_collections: {
    title: 'Centres that missed collections',
    intro: 'Call each centre, most missed first, to confirm they still need their allocation and can collect on their cohort day.',
    link: 'beneficiaries',
    run: insightRepo.centresMissingCollections,
    entry: (r) => ({
      name: r.name,
      detail: `Missed ${plural(r.missed, 'collection')}, last on ${fmtDate(r.last_missed)}`
        + (r.cohort ? ` · ${r.cohort}` : '')
        + (r.last_collected ? ` · last collected ${fmtDate(r.last_collected)}` : ' · no collection on record'),
      contact: contactOf(r),
    }),
  },

  open_discrepancies: {
    title: 'Suppliers with unresolved delivery discrepancies',
    intro: 'Contact each supplier to agree a credit note or a make-up delivery, then close the lines off on the delivery record.',
    link: 'deliveries',
    run: insightRepo.suppliersWithOpenDiscrepancies,
    entry: (r) => ({
      name: r.name,
      detail: `${plural(r.open_lines, 'open line')}`
        + (r.short_lines ? `, ${fmtNum(r.short_lines)} short-delivered` : '')
        + `, oldest from ${fmtDate(r.oldest)}`,
      contact: contactOf(r),
    }),
  },

  unreliable_suppliers: {
    title: 'Suppliers delivering the wrong quantity most often',
    intro: 'Raise the pattern with each supplier. A persistent rate above one in ten is worth a conversation about the contract.',
    link: 'purchaseOrders',
    run: insightRepo.unreliableSuppliers,
    entry: (r) => ({
      name: r.name,
      detail: `${fmtNum(r.rate, 1)}% of lines off (${fmtNum(r.off_lines)} of ${fmtNum(r.lines)})`,
      contact: contactOf(r),
    }),
  },

  supplier_spend: {
    title: 'Where the procurement money goes',
    intro: 'Check the biggest suppliers first. When one takes most of the spend, that is the relationship to negotiate, and the one whose failure hurts most.',
    link: 'purchaseOrders',
    run: insightRepo.supplierSpendShare,
    entry: (r) => ({
      name: r.name,
      detail: `${rand(r.spend)} · ${fmtNum(r.share, 1)}% of spend · ${plural(r.deliveries, 'delivery', 'deliveries')}`,
      contact: contactOf(r),
    }),
  },

  price_rises: {
    title: 'Products whose price went up',
    intro: 'Ask the latest supplier about each rise, and get a second quote where the increase is large.',
    link: 'purchaseOrders',
    run: insightRepo.productPriceRises,
    entry: (r) => ({
      name: r.name,
      detail: `${rand(r.first_price)} → ${rand(r.last_price)} per unit (+${fmtNum(r.rise_pct, 1)}%)`
        + (r.supplier ? ` · latest from ${r.supplier}` : ''),
      contact: contactOf(r),
    }),
  },

  low_stock: {
    title: 'Products to reorder',
    intro: 'Raise a purchase order for each product with no order open. Where an order is already open, chase it instead of ordering twice.',
    link: 'purchaseOrders',
    run: insightRepo.lowStockToReorder,
    entry: (r) => ({
      name: r.name,
      detail: `${fmtNum(r.on_hand, 2)} ${r.unit ?? ''} on hand, reorder at ${fmtNum(r.threshold, 2)}`
        + (r.open_orders ? ` · ${plural(r.open_orders, 'open order')} already` : ' · no open order')
        + (r.supplier ? ` · last supplied by ${r.supplier}` : ''),
      contact: contactOf(r),
    }),
  },

  near_expiry: {
    title: 'Stock expiring in the next two weeks',
    intro: 'Put these on the next picking slips first, so they leave the warehouse before they spoil.',
    link: 'stockLedger',
    run: () => insightRepo.stockNearExpiry({ withinDays: 14 }),
    entry: (r) => ({
      name: r.name,
      detail: `Expires ${fmtDate(r.expiry_date)} (${r.days_left === 0 ? 'today' : `in ${plural(r.days_left, 'day')}`})`
        + ` · ${fmtNum(r.quantity, 2)} ${r.unit ?? ''} received on that line`,
    }),
  },

  count_variance: {
    title: 'Products whose counts keep disagreeing with the system',
    intro: 'Recount these first. A product that is always short points at loss; one that swings both ways points at how it is being recorded.',
    link: 'stockLedger',
    run: insightRepo.countVarianceByProduct,
    entry: (r) => ({
      name: r.name,
      detail: `${fmtNum(r.variance, 2)} units off across ${plural(r.counts_off, 'count')}`
        + ` (net ${r.net_variance > 0 ? '+' : ''}${fmtNum(r.net_variance, 2)})`
        + `, last counted ${fmtDate(r.last_count)}`,
    }),
  },

  manual_adjustments: {
    title: 'Products adjusted by hand most often',
    intro: 'Review the reasons recorded on these adjustments. Frequent manual fixes usually hide a step in receiving or picking that is not being captured.',
    link: 'stockLedger',
    run: insightRepo.manualAdjustmentsByProduct,
    entry: (r) => ({
      name: r.name,
      detail: `${plural(r.adjustments, 'adjustment')}, net ${r.net_quantity > 0 ? '+' : ''}${fmtNum(r.net_quantity, 2)} units`,
    }),
  },

  overdue_orders: {
    title: 'Purchase orders past their delivery date',
    intro: 'Call each supplier about the order, oldest first, and either get a new date or move the order elsewhere.',
    link: 'purchaseOrders',
    run: insightRepo.overdueOrders,
    entry: (r) => ({
      name: `${r.po_number} · ${r.supplier}`,
      detail: `${plural(r.days_late, 'day')} late (due ${fmtDate(r.expected)}) · ${r.status.replace(/_/g, ' ')}`
        + ` · ${plural(r.lines, 'line')}`,
      contact: contactOf(r),
    }),
  },

  late_centres: {
    title: 'Centres collecting late most often',
    intro: 'Ask each centre whether their collection time still works for them, and agree a time they can keep.',
    link: 'beneficiaries',
    run: insightRepo.centresCollectingLate,
    entry: (r) => ({
      name: r.name,
      detail: `${plural(r.late, 'late collection')} of ${fmtNum(r.collected)} · ${fmtNum(r.rate, 1)}%`
        + (r.cohort ? ` · ${r.cohort}` : ''),
      contact: contactOf(r),
    }),
  },

  wastage_products: {
    title: 'Products losing the most food in decanting',
    intro: 'Check the sack quality from the supplier and how these products are being opened and bagged.',
    link: 'decantingRecords',
    run: insightRepo.wastageByProduct,
    entry: (r) => ({
      name: r.name,
      detail: `${fmtNum(r.wastage_kg, 1)} kg lost of ${fmtNum(r.packed_kg, 1)} kg packed (${fmtNum(r.rate, 1)}%)`
        + (r.recorded_by ? ` · recorded by ${r.recorded_by}` : ''),
    }),
  },

  flagged_products: {
    title: 'Products packers keep flagging',
    intro: 'The most common reason says what to fix: "short" is a stock or supplier problem, "wrong product" is a labelling or storage problem.',
    link: 'pickingSlips',
    run: insightRepo.flaggedProducts,
    entry: (r) => ({
      name: r.name,
      detail: `Flagged ${plural(r.flags, 'time')}`
        + (r.top_reason ? ` · most often: "${r.top_reason}"` : '')
        + (r.flagged_by ? ` · by ${r.flagged_by}` : ''),
    }),
  },

  overdue_slips: {
    title: 'Pallets past their dispatch date, by packer',
    intro: 'Check in with each packer, and reassign where one person is holding more than they can finish. Unassigned slips need an owner.',
    link: 'pickingSlips',
    run: insightRepo.overdueSlipsByPacker,
    entry: (r) => ({
      name: r.name,
      detail: `${plural(r.open_slips, 'open slip')}, oldest due ${fmtDate(r.oldest)}`
        + (r.centres ? ` · for ${r.centres}` : ''),
    }),
  },
};

// ── Business lenses ───────────────────────────────────────────
// Framing for the written reading, per area. The model is told to
// read the figures through this; the no-AI fallback uses it as-is.
export const LENSES = {
  dispatch:
    'Food that is packed but not collected is wasted packing effort and a centre that went without. ' +
    'Read the figures for whether food is reliably reaching centres, and which centres need a follow-up call.',
  receiving:
    'Every mismatch between what was ordered and what arrived is stock the warehouse planned on and does not have, ' +
    'or money paid for goods not received. Read the figures for supplier reliability and what is still unreconciled.',
  procurement:
    'Procurement spend is the charity\'s biggest controllable cost. Read the figures for where money goes, ' +
    'whether prices are creeping up, and how dependent the warehouse is on any one supplier.',
  stock:
    'Stock that runs out stops picking; stock that sits too long spoils. Read the figures for what needs ordering, ' +
    'what needs moving first, and whether the system can be trusted against the shelf.',
  decanting:
    'Decanting wastage is food bought or donated that never reaches a family. Read the figures for which products ' +
    'lose the most and whether it is getting better or worse.',
  picking:
    'A flagged line is a pallet that leaves short or late. Read the figures for which products cause it and ' +
    'whether packers have more work than they can finish.',
  donations:
    'Donations fund the operation and Section 18A certificates keep donors giving. Read the figures in aggregate only, ' +
    'for the value coming in and any certificates stuck in the process.',
  community:
    'Community requests show demand beyond the registered centres. Read the figures for how much is being met ' +
    'and how much is declined or still waiting.',
  volunteers:
    'Volunteer hours are free capacity. Read the figures in aggregate only, for whether that capacity is steady ' +
    'or dropping off.',
};

// ── Per metric ────────────────────────────────────────────────
// better:  'up' | 'down' | null — which direction of change is good.
// related: { metric, dimension } charts over the same period.
// actions: ids from ACTION_LISTS, most useful first.
// countRows: the headline is how many rows there are, not a sum
//            (a sum of "units below threshold" means nothing).
// target:   the DEFAULT for the line drawn on the chart and given to
//           the written reading. A starting point, not an agreed KPI:
//           each manager can set their own from the chart
//           (reporting_targets, migration 025), and "reset" returns
//           here. Any operational metric can take a personal target;
//           these are just the ones with a default.
// combo:    two measures on one monthly chart, bars and a line.
export const OPERATIONAL_INSIGHTS = {
  dispatch_volume: {
    area: 'dispatch', better: 'up',
    related: [{ metric: 'collection_compliance', dimension: 'month' }, { metric: 'picking_flag_rate', dimension: 'product' }],
    actions: ['overdue_slips', 'missed_collections'],
    combo: { title: 'Food dispatched and collection compliance, by month', bars: 'dispatch_volume', line: 'collection_compliance' },
  },
  collection_compliance: {
    area: 'dispatch', better: 'up', target: 90,
    related: [{ metric: 'repeat_non_collections', dimension: 'ecd_centre' }, { metric: 'collection_compliance', dimension: 'cohort' }],
    actions: ['missed_collections'],
  },
  repeat_non_collections: {
    area: 'dispatch', better: 'down',
    related: [{ metric: 'collection_compliance', dimension: 'month' }],
    actions: ['missed_collections'],
  },
  decanting_wastage: {
    area: 'decanting', better: 'down', target: 2,
    related: [{ metric: 'decanting_wastage', dimension: 'product' }, { metric: 'decanting_wastage', dimension: 'week' }],
    actions: ['wastage_products'],
  },
  goods_received: {
    area: 'receiving', better: null,
    related: [{ metric: 'receiving_discrepancy_rate', dimension: 'supplier' }, { metric: 'procurement_spend', dimension: 'supplier' }],
    actions: ['open_discrepancies', 'near_expiry'],
    combo: { title: 'Goods received and discrepancy rate, by month', bars: 'goods_received', line: 'receiving_discrepancy_rate' },
  },
  receiving_discrepancy_rate: {
    area: 'receiving', better: 'down', target: 5,
    related: [{ metric: 'unresolved_discrepancies', dimension: 'supplier' }, { metric: 'receiving_discrepancy_rate', dimension: 'month' }],
    actions: ['unreliable_suppliers', 'open_discrepancies'],
  },
  unresolved_discrepancies: {
    area: 'receiving', better: 'down',
    related: [{ metric: 'receiving_discrepancy_rate', dimension: 'supplier' }],
    actions: ['open_discrepancies'],
  },
  procurement_spend: {
    area: 'procurement', better: null,
    related: [{ metric: 'unit_price_trend', dimension: 'product' }, { metric: 'procurement_spend', dimension: 'month' }],
    actions: ['supplier_spend', 'price_rises'],
    combo: { title: 'Spend and average unit price, by month', bars: 'procurement_spend', line: 'unit_price_trend' },
  },
  unit_price_trend: {
    area: 'procurement', better: 'down',
    related: [{ metric: 'unit_price_trend', dimension: 'month' }, { metric: 'procurement_spend', dimension: 'supplier' }],
    actions: ['price_rises'],
  },
  donation_value: {
    area: 'donations', better: 'up',
    related: [{ metric: 'donation_value', dimension: 'category' }, { metric: 'section18a_pipeline', dimension: 's18a_status' }],
    actions: [],
  },
  section18a_pipeline: {
    area: 'donations', better: null,
    related: [{ metric: 'donation_value', dimension: 'month' }],
    actions: [],
  },
  stock_on_hand: {
    area: 'stock', better: null, countRows: true,
    related: [{ metric: 'low_stock_items', dimension: 'product' }],
    actions: ['low_stock', 'near_expiry'],
  },
  low_stock_items: {
    area: 'stock', better: 'down', countRows: true,
    related: [{ metric: 'picking_flag_rate', dimension: 'product' }],
    actions: ['low_stock', 'near_expiry'],
  },
  stock_movement_volume: {
    area: 'stock', better: null,
    related: [{ metric: 'stock_movement_volume', dimension: 'movement_type' }, { metric: 'stock_count_variance', dimension: 'product' }],
    actions: ['manual_adjustments'],
  },
  stock_count_variance: {
    area: 'stock', better: 'down',
    related: [{ metric: 'stock_count_variance', dimension: 'month' }, { metric: 'stock_movement_volume', dimension: 'movement_type' }],
    actions: ['count_variance', 'manual_adjustments'],
  },
  picking_flag_rate: {
    area: 'picking', better: 'down', target: 5,
    related: [{ metric: 'picking_flag_rate', dimension: 'month' }, { metric: 'low_stock_items', dimension: 'product' }],
    actions: ['flagged_products', 'overdue_slips'],
  },
  community_request_outcomes: {
    area: 'community', better: null,
    related: [{ metric: 'community_request_outcomes', dimension: 'month' }],
    actions: [],
  },
  volunteer_hours: {
    area: 'volunteers', better: 'up',
    related: [],
    actions: [],
  },

  // ── Second wave ─────────────────────────────────────────────
  po_on_time_rate: {
    area: 'procurement', better: 'up', target: 90,
    related: [{ metric: 'supplier_lead_time', dimension: 'supplier' }, { metric: 'po_on_time_rate', dimension: 'month' }],
    actions: ['overdue_orders'],
  },
  supplier_lead_time: {
    area: 'procurement', better: 'down',
    related: [{ metric: 'po_on_time_rate', dimension: 'supplier' }],
    actions: ['overdue_orders'],
  },
  overdue_purchase_orders: {
    area: 'procurement', better: 'down',
    related: [{ metric: 'po_on_time_rate', dimension: 'supplier' }],
    actions: ['overdue_orders'],
  },
  purchase_order_pipeline: {
    area: 'procurement', better: null,
    related: [{ metric: 'overdue_purchase_orders', dimension: 'supplier' }],
    actions: ['overdue_orders'],
  },
  picking_turnaround: {
    area: 'picking', better: 'down',
    related: [{ metric: 'slip_pipeline', dimension: 'slip_status' }, { metric: 'picking_flag_rate', dimension: 'month' }],
    actions: ['overdue_slips'],
  },
  slip_pipeline: {
    area: 'picking', better: null,
    related: [{ metric: 'picking_turnaround', dimension: 'week' }],
    actions: ['overdue_slips'],
  },
  gate_load_variance: {
    area: 'dispatch', better: 'down', target: 5,
    related: [{ metric: 'gate_load_variance', dimension: 'month' }, { metric: 'picking_flag_rate', dimension: 'product' }],
    actions: ['flagged_products'],
  },
  late_collection_rate: {
    area: 'dispatch', better: 'down', target: 10,
    related: [{ metric: 'collection_compliance', dimension: 'month' }, { metric: 'late_collection_rate', dimension: 'cohort' }],
    actions: ['late_centres'],
  },
  standing_order_demand: {
    area: 'stock', better: null,
    related: [{ metric: 'stock_on_hand', dimension: 'product' }, { metric: 'low_stock_items', dimension: 'product' }],
    actions: ['low_stock'],
  },
  stock_value: {
    area: 'stock', better: null,
    related: [{ metric: 'stock_value', dimension: 'storage_type' }, { metric: 'expiring_stock', dimension: 'product' }],
    actions: ['near_expiry'],
  },
  expiring_stock: {
    area: 'stock', better: 'down',
    related: [{ metric: 'stock_value', dimension: 'storage_type' }],
    actions: ['near_expiry'],
  },
  adjustment_reasons: {
    area: 'stock', better: 'down',
    related: [{ metric: 'adjustment_reasons', dimension: 'month' }, { metric: 'stock_count_variance', dimension: 'product' }],
    actions: ['manual_adjustments'],
  },
  decanting_margin_rate: {
    area: 'decanting', better: 'up', target: 95,
    related: [{ metric: 'decanting_margin_rate', dimension: 'product' }, { metric: 'decanting_wastage', dimension: 'week' }],
    actions: ['wastage_products'],
  },
  community_response_time: {
    area: 'community', better: 'down',
    related: [{ metric: 'community_request_outcomes', dimension: 'outcome' }],
    actions: [],
  },
  donation_routing: {
    area: 'donations', better: null,
    related: [{ metric: 'donation_value', dimension: 'category' }],
    actions: [],
  },
  volunteer_event_attendance: {
    area: 'volunteers', better: 'up', target: 80,
    related: [{ metric: 'volunteer_hours', dimension: 'month' }],
    actions: [],
  },
};

export const getInsightConfig = (metricId) =>
  Object.prototype.hasOwnProperty.call(OPERATIONAL_INSIGHTS, metricId)
    ? OPERATIONAL_INSIGHTS[metricId]
    : null;

export default { ACTION_LISTS, LENSES, OPERATIONAL_INSIGHTS, getInsightConfig };
