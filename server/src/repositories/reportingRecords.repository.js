// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingRecords.repository.js
//
// THE LOWEST LEVEL OF A REPORT: the records behind the figure.
//
// A chart can be opened by month, by week, by day, by supplier, by
// product. At the bottom of all of that there is no further chart, only
// the rows that were counted: the delivery lines, the pallets, the
// stock movements. This lists them, for the same period and the same
// filters as the report on screen, so a manager can see exactly what a
// bar is made of and check it against the notes.
//
// HOW IT IS BUILT
// Every report belongs to one FAMILY of records (REPORT_RECORDS). A
// family is one query shape: its tables, its columns, the date it goes
// by, and the filters it understands. A report may add its own
// condition on top ("only lines with a discrepancy").
//
// SAFE BY CONSTRUCTION
// Nothing from the request is ever put into the SQL text. The report id
// picks a family from a fixed list; every filter value and both dates
// are parameters; a filter a family does not understand is left out and
// reported back as ignored, never guessed at.
//
// PRIVACY
// Same rule as the reports themselves: no donor, no caller, no
// volunteer and no contact detail appears in any column here. A
// donation row is its date, category, value and certificate status.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { committedStockSql } from './committedStock.sql.js';
import { COLLECTED_STATUSES, NOT_COLLECTED_STATUSES, SAST } from '../features/reporting/reportCatalog.js';
import { OPEN_PO_STATUSES } from '../constants/purchaseOrderStatus.js';
import { listExpiringLots } from './shelfLots.repository.js';

export const MAX_RECORDS = 500;

const sastDate = (col) => `((${col} AT TIME ZONE '${SAST}')::date)`;
const sastTime = (col) => `to_char(${col} AT TIME ZONE '${SAST}', 'YYYY-MM-DD HH24:MI')`;
const TODAY = `((NOW() AT TIME ZONE '${SAST}')::date)`;
const LEFT_DAY = `COALESCE(${sastDate('de.collected_at')}, ps.dispatch_date)`;
const PRODUCT_CATEGORY = `COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorised')`;
const STORAGE_TYPE = `COALESCE(NULLIF(TRIM(p.storage_type), ''), 'Not set')`;
const inList = (values) => values.map((v) => `'${v}'`).join(', ');   // constants only, never input

// A filter the report can carry → the condition a family applies. `$?`
// is replaced by the parameter's number.
const PRODUCT_FILTERS = {
  product_category: `${PRODUCT_CATEGORY} = $?`,
  storage_type: `${STORAGE_TYPE} = $?`,
  programme_id: `p.programme_id = $?`,
};

// kind: text | number | money | date | datetime. The page aligns and
// formats by it; the CSV writes the value as it is.
const col = (key, label, kind, sql) => ({ key, label, kind, sql });

const FAMILIES = {
  // One line of one pallet, as loaded at the gate.
  dispatch_lines: {
    noun: 'gate lines',
    from: `dispatch_event_lines del
           JOIN dispatch_events de ON de.id = del.dispatch_event_id
           JOIN picking_slips ps ON ps.id = de.picking_slip_id
           JOIN products p ON p.id = del.product_id
      LEFT JOIN ecd_centres e ON e.id = ps.ecd_id`,
    date: LEFT_DAY,
    columns: [
      col('left', 'Left on', 'date', `${LEFT_DAY}::text`),
      col('booked', 'Booked for', 'date', `ps.dispatch_date::text`),
      col('centre', 'Collected by', 'text', `COALESCE(e.name, ps.beneficiary_name, 'Unknown')`),
      col('pallet', 'Pallet', 'text', `COALESCE(ps.pallet_ref, 'P-' || ps.id)`),
      col('product', 'Product', 'text', `p.name`),
      col('packed', 'Packed', 'number', `del.packed_quantity`),
      col('loaded', 'Loaded', 'number', `del.loaded_quantity`),
      col('unit', 'Unit', 'text', `del.unit`),
      col('outcome', 'Outcome', 'text', `REPLACE(de.status, '_', ' ')`),
      col('reason', 'Reason for a difference', 'text', `COALESCE(del.variance_reason, '')`),
    ],
    filters: {
      cohort: `ps.cohort = $?::cohort_group`, beneficiary_kind: `ps.beneficiary_kind = $?::beneficiary_type`,
      ecd_id: `ps.ecd_id = $?`, product_id: `del.product_id = $?`, ...PRODUCT_FILTERS,
    },
    order: `1 DESC, 3, 5`,
  },

  // One pallet (picking slip), with what happened to it at the gate.
  pallets: {
    noun: 'pallets',
    from: `picking_slips ps
      LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
      LEFT JOIN ecd_centres e ON e.id = ps.ecd_id`,
    date: `ps.dispatch_date`,
    columns: [
      col('booked', 'Booked for', 'date', `ps.dispatch_date::text`),
      col('centre', 'Centre', 'text', `COALESCE(e.name, ps.beneficiary_name, 'Unknown')`),
      col('pallet', 'Pallet', 'text', `COALESCE(ps.pallet_ref, 'P-' || ps.id)`),
      col('cohort', 'Cohort', 'text', `ps.cohort::text`),
      col('kind', 'Beneficiary type', 'text', `REPLACE(ps.beneficiary_kind::text, '_', ' ')`),
      col('status', 'Packing status', 'text', `REPLACE(ps.status, '_', ' ')`),
      col('outcome', 'Gate outcome', 'text', `COALESCE(REPLACE(de.status, '_', ' '), 'not at the gate yet')`),
      col('collected', 'Collected at', 'datetime', sastTime('de.collected_at')),
      col('lines', 'Lines', 'number', `(SELECT COUNT(*) FROM picking_slip_items i WHERE i.picking_slip_id = ps.id)`),
      col('hours', 'Hours to pack', 'number', `ROUND((EXTRACT(EPOCH FROM (ps.completed_at - ps.started_at)) / 3600.0)::numeric, 1)`),
    ],
    filters: {
      cohort: `ps.cohort = $?::cohort_group`, beneficiary_kind: `ps.beneficiary_kind = $?::beneficiary_type`,
      ecd_id: `ps.ecd_id = $?`, slip_status: `ps.status::text = $?`,
    },
    order: `1 DESC, 2`,
  },

  // One product line on one pallet, as the packer left it.
  slip_lines: {
    noun: 'pallet lines',
    from: `picking_slip_items psi
           JOIN picking_slips ps ON ps.id = psi.picking_slip_id
           JOIN products p ON p.id = psi.product_id
      LEFT JOIN ecd_centres e ON e.id = ps.ecd_id`,
    date: `ps.dispatch_date`,
    columns: [
      col('booked', 'Booked for', 'date', `ps.dispatch_date::text`),
      col('centre', 'Centre', 'text', `COALESCE(e.name, ps.beneficiary_name, 'Unknown')`),
      col('product', 'Product', 'text', `p.name`),
      col('required', 'Asked for', 'number', `psi.required_quantity`),
      col('packed', 'Packed', 'number', `psi.packed_quantity`),
      col('unit', 'Unit', 'text', `psi.unit`),
      col('status', 'Line status', 'text', `psi.status::text`),
      col('reason', 'Flag reason', 'text', `COALESCE(psi.flag_reason, '')`),
    ],
    filters: { cohort: `ps.cohort = $?::cohort_group`, product_id: `psi.product_id = $?`, ecd_id: `ps.ecd_id = $?`, ...PRODUCT_FILTERS },
    order: `1 DESC, 2, 3`,
  },

  // One product line on one delivery note.
  delivery_lines: {
    noun: 'delivery lines',
    from: `delivery_note_items dni
           JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
      LEFT JOIN suppliers s ON s.id = dn.supplier_id
           JOIN products p ON p.id = dni.product_id
      LEFT JOIN purchase_orders po ON po.id = dn.purchase_order_id
      LEFT JOIN purchase_order_items poi ON poi.id = dni.purchase_order_item_id
      LEFT JOIN stock_levels sl ON sl.product_id = dni.product_id`,
    date: `dn.delivery_date`,
    columns: [
      col('delivered', 'Delivered', 'date', `dn.delivery_date::text`),
      col('note', 'Delivery note', 'text', `'#' || LPAD(dn.id::text, 4, '0')`),
      col('order', 'Purchase order', 'text', `COALESCE(po.po_number, '')`),
      col('supplier', 'Supplier', 'text', `COALESCE(s.name, 'No supplier')`),
      col('product', 'Product', 'text', `p.name`),
      col('expected', 'Expected', 'number', `dni.expected_quantity`),
      col('received', 'Received', 'number', `dni.received_quantity`),
      col('unit', 'Unit', 'text', `dni.unit`),
      col('difference', 'Difference', 'number', `dni.discrepancy_quantity`),
      col('resolved', 'Difference resolved?', 'text', `CASE WHEN COALESCE(dni.discrepancy_quantity, 0) = 0 THEN '' WHEN dni.discrepancy_resolved THEN 'yes' ELSE 'no' END`),
      col('price', 'Unit price', 'money', `poi.unit_price`),
      col('value', 'Value', 'money', `ROUND((dni.received_quantity * poi.unit_price)::numeric, 2)`),
      col('expiry', 'Use by', 'date', `dni.expiry_date::text`),
      col('stored', 'Stored in', 'text', `COALESCE(dni.storage_area, '')`),
    ],
    filters: { supplier_id: `dn.supplier_id = $?`, product_id: `dni.product_id = $?`, ...PRODUCT_FILTERS },
    order: `1 DESC, 2, 5`,
  },

  purchase_orders: {
    noun: 'purchase orders',
    from: `purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN LATERAL (SELECT MIN(dn.delivery_date) AS first_delivery FROM delivery_notes dn WHERE dn.purchase_order_id = po.id) d ON true
      LEFT JOIN LATERAL (SELECT COUNT(*) AS lines, ROUND(SUM(poi.expected_quantity * poi.unit_price)::numeric, 2) AS value
                           FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) v ON true`,
    date: sastDate('po.created_at'),
    columns: [
      col('number', 'Order', 'text', `COALESCE(po.po_number, 'PO ' || po.id)`),
      col('supplier', 'Supplier', 'text', `COALESCE(s.name, 'No supplier')`),
      col('status', 'Status', 'text', `REPLACE(po.status, '_', ' ')`),
      col('raised', 'Raised', 'date', `${sastDate('po.created_at')}::text`),
      col('expected', 'Expected', 'date', `po.expected_delivery_date::text`),
      col('first', 'First delivery', 'date', `d.first_delivery::text`),
      col('late', 'Days late', 'number', `CASE WHEN d.first_delivery IS NOT NULL THEN GREATEST(d.first_delivery - po.expected_delivery_date, 0)
                                               WHEN po.expected_delivery_date < ${TODAY} THEN ${TODAY} - po.expected_delivery_date END`),
      col('lines', 'Lines', 'number', `v.lines`),
      col('value', 'Order value', 'money', `v.value`),
    ],
    filters: { supplier_id: `po.supplier_id = $?`, po_status: `po.status = $?` },
    order: `4 DESC, 1`,
  },

  movements: {
    noun: 'stock movements',
    from: `stock_movements sm JOIN products p ON p.id = sm.product_id`,
    date: sastDate('sm.created_at'),
    columns: [
      col('when', 'When', 'datetime', sastTime('sm.created_at')),
      col('product', 'Product', 'text', `p.name`),
      col('type', 'Movement', 'text', `sm.movement_type`),
      col('quantity', 'Quantity', 'number', `sm.quantity`),
      col('unit', 'Unit', 'text', `sm.unit`),
      col('reason', 'Reason', 'text', `COALESCE(sm.reason, '')`),
      col('from', 'Came from', 'text', `COALESCE(REPLACE(sm.reference_type, '_', ' ') || ' ' || sm.reference_id, '')`),
    ],
    filters: { movement_type: `sm.movement_type = $?`, product_id: `sm.product_id = $?`, ...PRODUCT_FILTERS },
    order: `1 DESC, 2`,
  },

  // Every active product as it stands now.
  stock: {
    noun: 'products',
    from: `products p
           JOIN stock_levels sl ON sl.product_id = p.id
      LEFT JOIN (${committedStockSql()}) c ON c.product_id = p.id`,
    date: null,
    base: [`p.is_active = true`],
    columns: [
      col('product', 'Product', 'text', `p.name`),
      col('code', 'Code', 'text', `COALESCE(p.stock_keeping_unit, '')`),
      col('category', 'Category', 'text', PRODUCT_CATEGORY),
      col('storage', 'Storage', 'text', STORAGE_TYPE),
      col('on_hand', 'On hand', 'number', `sl.quantity_on_hand`),
      col('promised', 'Promised', 'number', `COALESCE(c.committed, 0)`),
      col('available', 'Available', 'number', `sl.quantity_on_hand - COALESCE(c.committed, 0)`),
      col('reorder', 'Reorder level', 'number', `COALESCE(sl.reorder_threshold, 0)`),
      col('unit', 'Unit', 'text', `sl.unit`),
      col('cost', 'Unit cost', 'money', `p.unit_cost`),
      col('value', 'Value', 'money', `ROUND((GREATEST(sl.quantity_on_hand, 0) * p.unit_cost)::numeric, 2)`),
    ],
    filters: { product_id: `p.id = $?`, ...PRODUCT_FILTERS },
    order: `1`,
  },

  decanting_lines: {
    noun: 'decanting lines',
    from: `decanting_lines dl
           JOIN decanting_records dr ON dr.id = dl.decanting_id
      LEFT JOIN products p ON p.id = dl.product_id`,
    date: `dr.week_of`,
    columns: [
      col('week', 'Week of', 'date', `dr.week_of::text`),
      col('product', 'Product', 'text', `COALESCE(p.name, 'Unknown product')`),
      col('needed', 'Needed (kg)', 'number', `dl.required_kg`),
      col('bulk', 'Bulk used (kg)', 'number', `dl.actual_bulk_kg`),
      col('packed', 'Packed (kg)', 'number', `dl.packed_kg`),
      col('bags', 'Bags', 'number', `dl.total_bags`),
      col('wastage', 'Wastage (kg)', 'number', `dl.wastage_kg`),
      col('margin', 'Within margin?', 'text', `CASE WHEN dl.within_margin THEN 'yes' ELSE 'no' END`),
      col('notes', 'Notes', 'text', `COALESCE(dl.notes, '')`),
    ],
    filters: { product_id: `dl.product_id = $?` },
    order: `1 DESC, 2`,
  },

  stock_count_lines: {
    noun: 'count lines',
    from: `stock_count_lines scl
           JOIN stock_counts sc ON sc.id = scl.stock_count_id
           JOIN products p ON p.id = scl.product_id`,
    date: `sc.count_date`,
    columns: [
      col('counted', 'Counted on', 'date', `sc.count_date::text`),
      col('product', 'Product', 'text', `p.name`),
      col('system', 'System said', 'number', `scl.system_quantity`),
      col('found', 'Counted', 'number', `scl.counted_quantity`),
      col('variance', 'Difference', 'number', `scl.variance`),
      col('unit', 'Unit', 'text', `scl.unit`),
      col('reason', 'Reason', 'text', `COALESCE(scl.reason_code, '')`),
    ],
    filters: { product_id: `scl.product_id = $?` },
    order: `1 DESC, 2`,
  },

  // A donation, never its donor.
  donations: {
    noun: 'donations',
    from: `donations dn`,
    date: sastDate('dn.received_at'),
    columns: [
      col('received', 'Received', 'date', `${sastDate('dn.received_at')}::text`),
      col('ref', 'Donation', 'text', `'#' || dn.id`),
      col('category', 'Category', 'text', `COALESCE(REPLACE(dn.donation_category, '_', ' '), 'uncategorised')`),
      col('value', 'Estimated value', 'money', `dn.estimated_value_zar`),
      col('s18a', 'Section 18A', 'text', `COALESCE(REPLACE(dn.section_18a_status, '_', ' '), '')`),
      col('status', 'Status', 'text', `COALESCE(REPLACE(dn.status, '_', ' '), '')`),
      col('items', 'Items', 'number', `(SELECT COUNT(*) FROM donation_items di WHERE di.donation_id = dn.id)`),
    ],
    filters: { donation_category: `dn.donation_category = $?`, s18a_status: `dn.section_18a_status = $?` },
    order: `1 DESC, 2`,
  },

  donation_items: {
    noun: 'donated items',
    from: `donation_items di JOIN donations dn ON dn.id = di.donation_id`,
    date: sastDate('di.created_at'),
    columns: [
      col('logged', 'Logged', 'date', `${sastDate('di.created_at')}::text`),
      col('ref', 'Donation', 'text', `'#' || dn.id`),
      col('item', 'Item', 'text', `COALESCE(di.description, '')`),
      col('quantity', 'Quantity', 'number', `di.quantity`),
      col('unit', 'Unit', 'text', `COALESCE(di.unit, '')`),
      col('category', 'Donation category', 'text', `COALESCE(REPLACE(dn.donation_category, '_', ' '), 'uncategorised')`),
      col('routing', 'Routing', 'text', `REPLACE(di.routing_status, '_', ' ')`),
    ],
    filters: { donation_category: `dn.donation_category = $?`, routing_status: `di.routing_status = $?` },
    order: `1 DESC, 2`,
  },

  // A request, never its caller.
  requests: {
    noun: 'requests',
    from: `community_requests cr`,
    date: sastDate('cr.requested_at'),
    columns: [
      col('requested', 'Requested', 'datetime', sastTime('cr.requested_at')),
      col('ref', 'Request', 'text', `'#' || cr.id`),
      col('asked', 'Asked for', 'text', `COALESCE(cr.items_requested, '')`),
      col('outcome', 'Outcome', 'text', `REPLACE(cr.outcome::text, '_', ' ')`),
      col('resolved', 'Resolved', 'datetime', sastTime('cr.resolved_at')),
      col('hours', 'Hours to resolve', 'number', `ROUND((EXTRACT(EPOCH FROM (cr.resolved_at - cr.requested_at)) / 3600.0)::numeric, 1)`),
    ],
    filters: { outcome: `cr.outcome::text = $?` },
    order: `1 DESC`,
  },

  // A sign-in at the door, never the person's name.
  visits: {
    noun: 'sign-ins',
    from: `volunteers v`,
    date: sastDate('v.signed_in_at'),
    columns: [
      col('in', 'Signed in', 'datetime', sastTime('v.signed_in_at')),
      col('out', 'Signed out', 'datetime', sastTime('v.signed_out_at')),
      col('hours', 'Hours', 'number', `ROUND((EXTRACT(EPOCH FROM (v.signed_out_at - v.signed_in_at)) / 3600.0)::numeric, 1)`),
      col('how', 'Signed in by', 'text', `COALESCE(v.source, '')`),
    ],
    filters: {},
    order: `1 DESC`,
  },

  // A booking on an event, never the volunteer.
  bookings: {
    noun: 'bookings',
    from: `volunteer_bookings vb
           JOIN event_timeslots ts ON ts.timeslot_id = vb.timeslot_id
           JOIN love_activism_events ev ON ev.event_id = ts.event_id
      LEFT JOIN attendance a ON a.booking_id = vb.booking_id`,
    date: sastDate('ts.start_time'),
    columns: [
      col('slot', 'Timeslot', 'datetime', sastTime('ts.start_time')),
      col('event', 'Event', 'text', `ev.event_name`),
      col('status', 'Booking', 'text', `INITCAP(vb.booking_status)`),
      col('source', 'Booked through', 'text', `COALESCE(vb.booking_source, '')`),
      col('checked', 'Checked in?', 'text', `CASE WHEN a.checked_in THEN 'yes' ELSE 'no' END`),
    ],
    filters: {},
    order: `1 DESC, 2`,
  },

  order_lines: {
    noun: 'standing order lines',
    from: `ecd_order_lines ol
           JOIN ecd_centres e ON e.id = ol.ecd_id
           JOIN products p ON p.id = ol.product_id`,
    date: null,
    base: [`e.is_active = true`, `ol.effective_from <= ${TODAY}`, `(ol.effective_to IS NULL OR ol.effective_to >= ${TODAY})`],
    columns: [
      col('centre', 'Centre', 'text', `e.name`),
      col('cohort', 'Cohort', 'text', `e.cohort::text`),
      col('product', 'Product', 'text', `p.name`),
      col('quantity', 'Each cycle', 'number', `ol.quantity`),
      col('unit', 'Unit', 'text', `ol.unit`),
      col('since', 'Since', 'date', `ol.effective_from::text`),
    ],
    filters: { product_id: `ol.product_id = $?`, ecd_id: `ol.ecd_id = $?`, cohort: `e.cohort = $?::cohort_group`, ...PRODUCT_FILTERS },
    order: `1, 3`,
  },
};

// Which records each report is made of, and any condition of its own.
// `date` overrides the family's date; `noDate` lists a live report's
// rows whatever the period.
export const REPORT_RECORDS = {
  dispatch_volume:            { family: 'dispatch_lines', where: [`de.status IN (${inList(COLLECTED_STATUSES)})`] },
  gate_load_variance:         { family: 'dispatch_lines' },
  collection_compliance:      { family: 'pallets', where: [`ps.status IN ('complete', 'dispatched')`] },
  repeat_non_collections:     { family: 'pallets', where: [`de.status IN (${inList(NOT_COLLECTED_STATUSES)})`] },
  late_collection_rate:       { family: 'pallets', where: [`de.status IN (${inList(COLLECTED_STATUSES)})`] },
  picking_turnaround:         { family: 'pallets', where: [`ps.started_at IS NOT NULL`, `ps.completed_at > ps.started_at`] },
  slip_pipeline:              { family: 'pallets', noDate: true, where: [`ps.dispatch_date BETWEEN ${TODAY} - 7 AND ${TODAY} + 14`] },
  picking_flag_rate:          { family: 'slip_lines', where: [`psi.status IN ('confirmed', 'flagged')`] },
  goods_received:             { family: 'delivery_lines' },
  receiving_discrepancy_rate: { family: 'delivery_lines' },
  unresolved_discrepancies:   { family: 'delivery_lines', where: [`COALESCE(dni.discrepancy_quantity, 0) <> 0`, `dni.discrepancy_resolved = false`] },
  procurement_spend:          { family: 'delivery_lines', where: [`poi.unit_price IS NOT NULL`] },
  unit_price_trend:           { family: 'delivery_lines', where: [`poi.unit_price IS NOT NULL`, `dni.received_quantity > 0`] },
  // The deliveries the estimate says still have stock and are not dismissed,
  // expiring within the days given (shelfLots.repository.js).
  expiring_stock:             { family: 'delivery_lines', noDate: true, liveExpiryDays: 30 },
  po_on_time_rate:            { family: 'purchase_orders', date: `po.expected_delivery_date`, where: [`po.status <> 'returned'`] },
  supplier_lead_time:         { family: 'purchase_orders', where: [`po.status <> 'returned'`, `d.first_delivery IS NOT NULL`] },
  overdue_purchase_orders:    { family: 'purchase_orders', noDate: true, where: [`po.status IN (${inList(OPEN_PO_STATUSES)})`, `po.expected_delivery_date < ${TODAY}`] },
  purchase_order_pipeline:    { family: 'purchase_orders' },
  stock_movement_volume:      { family: 'movements' },
  adjustment_reasons:         { family: 'movements', where: [`sm.movement_type = 'adjustment'`] },
  stock_flow:                 { family: 'movements', where: [`sm.unit = 'kg'`] },
  stock_on_hand:              { family: 'stock', where: [`sl.quantity_on_hand > 0`] },
  low_stock_items:            { family: 'stock', where: [`(sl.quantity_on_hand - COALESCE(c.committed, 0)) <= COALESCE(sl.reorder_threshold, 0)`] },
  stock_value:                { family: 'stock', where: [`sl.quantity_on_hand > 0`] },
  days_of_cover:              { family: 'stock' },
  decanting_wastage:          { family: 'decanting_lines' },
  decanting_margin_rate:      { family: 'decanting_lines' },
  stock_count_variance:       { family: 'stock_count_lines', where: [`scl.variance IS NOT NULL`] },
  donation_value:             { family: 'donations' },
  section18a_pipeline:        { family: 'donations' },
  donation_routing:           { family: 'donation_items' },
  community_request_outcomes: { family: 'requests' },
  community_response_time:    { family: 'requests', where: [`cr.resolved_at IS NOT NULL`] },
  volunteer_hours:            { family: 'visits', where: [`v.signed_out_at > v.signed_in_at`] },
  volunteer_event_attendance: { family: 'bookings', where: [`vb.booking_status = 'CONFIRMED'`, `ts.start_time < NOW()`] },
  standing_order_demand:      { family: 'order_lines', where: [`ol.unit = 'kg'`] },
};

export const hasRecords = (metricId) => Boolean(REPORT_RECORDS[metricId]);

/** The query for a report's records. Exported for the tests. */
export const buildRecordsSql = ({ metric, filters = {}, dateRange = null, lineIds = null }) => {
  const plan = REPORT_RECORDS[metric];
  if (!plan) return null;
  const family = FAMILIES[plan.family];
  const params = [];
  const where = [...(family.base ?? []), ...(plan.where ?? [])];
  const dateExpr = plan.noDate ? null : (plan.date ?? family.date);
  if (dateExpr && dateRange) {
    params.push(dateRange.from, dateRange.to);
    where.push(`${dateExpr} BETWEEN $1::date AND $2::date`);
  }
  // A report of the deliveries the shelf estimate keeps: just those lines.
  if (plan.liveExpiryDays) {
    params.push(lineIds ?? []);
    where.push(`dni.id = ANY($${params.length}::int[])`);
  }
  const ignored = [];
  for (const [key, value] of Object.entries(filters)) {
    const clause = family.filters[key];
    if (!clause) { ignored.push(key); continue; }
    params.push(value);
    where.push(clause.replace('$?', `$${params.length}`));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const select = family.columns.map((c) => `${c.sql} AS "${c.key}"`).join(',\n            ');
  return {
    family, params, ignored,
    sql: `SELECT ${select}
       FROM ${family.from}
      ${whereSql}
      ORDER BY ${family.order}
      LIMIT ${MAX_RECORDS}`,
    countSql: `SELECT COUNT(*)::int AS n FROM ${family.from} ${whereSql}`,
  };
};

const NUMERIC = new Set(['number', 'money']);

/** The records behind a report: columns, up to MAX_RECORDS rows, and how many there are in all. */
export const listRecords = async (spec) => {
  const days = REPORT_RECORDS[spec.metric]?.liveExpiryDays;
  const lineIds = days ? (await listExpiringLots({ withinDays: days })).map((lot) => lot.lineId) : null;
  const built = buildRecordsSql({ ...spec, lineIds });
  if (!built) return null;
  const [{ rows }, count] = await Promise.all([
    pool.query(built.sql, built.params),
    pool.query(built.countSql, built.params),
  ]);
  const columns = built.family.columns.map(({ key, label, kind }) => ({ key, label, kind }));
  return {
    noun: built.family.noun,
    columns,
    rows: rows.map((r) => Object.fromEntries(columns.map((c) => [
      c.key, r[c.key] === null || r[c.key] === undefined ? null : NUMERIC.has(c.kind) ? Number(r[c.key]) : r[c.key],
    ]))),
    total: count.rows[0]?.n ?? rows.length,
    ignoredFilters: built.ignored,
  };
};

// The choices for a filter that has no fixed list: the suppliers,
// products, centres and programmes by name, and each status or
// category as the data actually holds it.
const OPTION_QUERIES = {
  supplier_id:  `SELECT id::text AS value, name AS label FROM suppliers WHERE archived_at IS NULL ORDER BY name LIMIT 500`,
  product_id:   `SELECT id::text AS value, name AS label FROM products WHERE archived_at IS NULL ORDER BY name LIMIT 1000`,
  ecd_id:       `SELECT id::text AS value, name AS label FROM ecd_centres ORDER BY name LIMIT 1000`,
  programme_id: `SELECT id::text AS value, name AS label FROM programmes ORDER BY name LIMIT 100`,
  product_category: `SELECT DISTINCT COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised') AS value FROM products ORDER BY 1 LIMIT 200`,
  storage_type:     `SELECT DISTINCT COALESCE(NULLIF(TRIM(storage_type), ''), 'Not set') AS value FROM products ORDER BY 1 LIMIT 50`,
  po_status:        `SELECT DISTINCT status AS value FROM purchase_orders WHERE status IS NOT NULL ORDER BY 1`,
  slip_status:      `SELECT DISTINCT status::text AS value FROM picking_slips WHERE status IS NOT NULL ORDER BY 1`,
  outcome:          `SELECT DISTINCT outcome::text AS value FROM community_requests WHERE outcome IS NOT NULL ORDER BY 1`,
  s18a_status:      `SELECT DISTINCT section_18a_status AS value FROM donations WHERE section_18a_status IS NOT NULL ORDER BY 1`,
  routing_status:   `SELECT DISTINCT routing_status AS value FROM donation_items WHERE routing_status IS NOT NULL ORDER BY 1`,
};

export const listFilterOptions = async () => {
  const out = {};
  for (const [key, sql] of Object.entries(OPTION_QUERIES)) {
    try {
      const { rows } = await pool.query(sql);
      out[key] = rows.map((r) => ({ value: r.value, label: r.label ?? r.value }));
    } catch (err) {
      // A table this deployment does not have yet: that filter simply
      // has no choices, the rest still load.
      if (err.code !== '42P01' && err.code !== '42703') throw err;
      out[key] = [];
    }
  }
  return out;
};

export default { MAX_RECORDS, REPORT_RECORDS, hasRecords, buildRecordsSql, listRecords, listFilterOptions };
