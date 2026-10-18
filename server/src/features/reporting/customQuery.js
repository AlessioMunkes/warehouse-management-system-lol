// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/customQuery.js
//
// Custom reports: "how many X by Y" for the questions no prepared
// report answers — above all, counts by every status in the system
// (purchase orders, slips, collections, deliveries, donations,
// Section 18A, requests, compost, events, stock movements).
//
// THE MODEL (OR THE BUILDER) NAMES THINGS; THIS FILE WRITES THE SQL.
// A custom spec is only ever names from the lists below:
//   { dataset, groupBy: [0–2 keys], measure, filters: { key: value } }
// Every name is checked against its dataset; anything unknown is a
// 400. Group-by, measure and date columns are SQL fragments written
// here, never text from a request. Filter VALUES are the only thing
// from outside, and they go in as $1, $2 parameters — and are checked
// against the dataset's allowed values (or must be a whole number
// for an id) first.
//
// PRIVACY. No group-by or filter exposes a person's contact details,
// ID number or address. Donors, callers and volunteers are counted,
// never listed.
//
// The result has the same shape as a catalog report (spec,
// description, series, total, meta), so the chart, table, Generate
// report, PDF and dashboard widgets all work on it unchanged.
// ─────────────────────────────────────────────────────────────

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const month = (col) => `to_char(date_trunc('month', ${col}), 'YYYY-MM')`;
const week = (col) => `to_char(${col}, 'IYYY-"W"IW')`;

// A moment recorded with a time zone, read as the warehouse's clock.
// Without this a delivery booked in at 00:30 on the 12th is the 11th
// to the database, which keeps time in UTC, and "today" loses it.
const local = (col) => `(${col} AT TIME ZONE 'Africa/Johannesburg')`;
const weekdayOf = (col) => `trim(to_char(${col}, 'Day'))`;

// `values` — the only values a filter accepts (statuses); `id: true` —
// a whole-number id. Anything else is refused before pg is touched.
export const DATASETS = {
  purchase_orders: {
    label: 'Purchase orders',
    description: 'Orders raised to suppliers.',
    from: `purchase_orders po
           LEFT JOIN suppliers s ON s.id = po.supplier_id
           LEFT JOIN LATERAL (SELECT SUM(poi.expected_quantity * COALESCE(poi.unit_price, 0)) AS value
                                FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) v ON TRUE`,
    date: local('po.created_at'),
    dateLabel: 'raised',
    groups: {
      status:   { label: 'Status', sql: 'po.status' },
      supplier: { label: 'Supplier', sql: "COALESCE(s.name, 'No supplier')" },
      finance_email: { label: 'Finance email', sql: "COALESCE(po.finance_email_status, 'not sent')" },
      month:    { label: 'Month raised', sql: month(local('po.created_at')), time: true },
    },
    filters: {
      status: { label: 'Status', sql: 'po.status', values: ['pending', 'approved', 'in_transit', 'partially_received', 'completed', 'returned', 'follow_up_required'] },
      supplier_id: { label: 'Supplier', sql: 'po.supplier_id', id: true },
    },
    measures: {
      count: { label: 'Number of orders', sql: 'COUNT(*)', unit: 'orders' },
      value: { label: 'Order value', sql: 'COALESCE(SUM(v.value), 0)', unit: 'ZAR' },
    },
  },

  picking_slips: {
    label: 'Picking slips',
    description: 'Slips generated for centres to be packed and collected.',
    from: `picking_slips ps LEFT JOIN ecd_centres e ON e.id = ps.ecd_id`,
    date: 'ps.dispatch_date',
    dateLabel: 'due to go out',
    groups: {
      status:      { label: 'Packing status', sql: 'ps.status' },
      cohort:      { label: 'Cohort', sql: 'ps.cohort::text' },
      beneficiary: { label: 'Beneficiary type', sql: 'ps.beneficiary_kind::text' },
      centre:      { label: 'Centre', sql: "COALESCE(e.name, ps.beneficiary_name, 'Unknown')" },
      month:       { label: 'Month', sql: month('ps.dispatch_date'), time: true },
      week:        { label: 'Week', sql: week('ps.dispatch_date'), time: true },
    },
    filters: {
      status: { label: 'Packing status', sql: 'ps.status', values: ['pending', 'in_progress', 'complete', 'dispatched'] },
      cohort: { label: 'Cohort', sql: 'ps.cohort::text', values: ['week1', 'week2', 'tuesday', 'thursday'] },
      beneficiary: { label: 'Beneficiary type', sql: 'ps.beneficiary_kind::text', values: ['ecd', 'soup_kitchen', 'dignity_kitchen', 'community'] },
    },
    measures: { count: { label: 'Number of slips', sql: 'COUNT(*)', unit: 'slips' } },
  },

  picking_lines: {
    label: 'Picking slip lines',
    description: 'Individual product lines on picking slips, and whether they were packed or flagged.',
    from: `picking_slip_items psi
           JOIN picking_slips ps ON ps.id = psi.picking_slip_id
           LEFT JOIN products p ON p.id = psi.product_id`,
    date: 'ps.dispatch_date',
    dateLabel: 'due to go out',
    groups: {
      status:  { label: 'Line status', sql: 'psi.status::text' },
      product: { label: 'Product', sql: "COALESCE(p.name, 'Unknown')" },
      cohort:  { label: 'Cohort', sql: 'ps.cohort::text' },
      month:   { label: 'Month', sql: month('ps.dispatch_date'), time: true },
    },
    filters: {
      status: { label: 'Line status', sql: 'psi.status::text', values: ['pending', 'confirmed', 'flagged'] },
      product_id: { label: 'Product', sql: 'psi.product_id', id: true },
    },
    measures: { count: { label: 'Number of lines', sql: 'COUNT(*)', unit: 'lines' } },
  },

  collections: {
    label: 'Collections at the gate',
    description: 'Each pallet handed over (or not) at the dispatch gate.',
    from: `dispatch_events de
           JOIN picking_slips ps ON ps.id = de.picking_slip_id
           LEFT JOIN ecd_centres e ON e.id = ps.ecd_id`,
    date: 'ps.dispatch_date',
    dateLabel: 'due to be collected',
    groups: {
      status:      { label: 'Outcome', sql: 'de.status' },
      cohort:      { label: 'Cohort', sql: 'ps.cohort::text' },
      beneficiary: { label: 'Beneficiary type', sql: 'ps.beneficiary_kind::text' },
      centre:      { label: 'Centre', sql: "COALESCE(e.name, ps.beneficiary_name, 'Unknown')" },
      month:       { label: 'Month', sql: month('ps.dispatch_date'), time: true },
      weekday:     { label: 'Day of the week', sql: "trim(to_char(ps.dispatch_date, 'Day'))" },
    },
    filters: {
      status: { label: 'Outcome', sql: 'de.status', values: ['collected', 'late_collected', 'not_collected', 'cancelled'] },
      cohort: { label: 'Cohort', sql: 'ps.cohort::text', values: ['week1', 'week2', 'tuesday', 'thursday'] },
    },
    measures: { count: { label: 'Number of pallets', sql: 'COUNT(*)', unit: 'pallets' } },
  },

  deliveries: {
    label: 'Deliveries received',
    description: 'Delivery notes recorded at receiving.',
    from: `delivery_notes dn LEFT JOIN suppliers s ON s.id = dn.supplier_id`,
    date: 'dn.delivery_date',
    dateLabel: 'delivered',
    groups: {
      status:   { label: 'Status', sql: 'dn.status' },
      supplier: { label: 'Supplier', sql: "COALESCE(s.name, 'No supplier')" },
      month:    { label: 'Month', sql: month('dn.delivery_date'), time: true },
      weekday:  { label: 'Day of the week', sql: "trim(to_char(dn.delivery_date, 'Day'))" },
    },
    filters: {
      status: { label: 'Status', sql: 'dn.status', values: ['recorded', 'flagged', 'closed'] },
      supplier_id: { label: 'Supplier', sql: 'dn.supplier_id', id: true },
    },
    measures: { count: { label: 'Number of deliveries', sql: 'COUNT(*)', unit: 'deliveries' } },
  },

  delivery_lines: {
    label: 'Delivery lines',
    description: 'Product lines on delivery notes, with what was expected against what arrived.',
    from: `delivery_note_items dni
           JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
           LEFT JOIN suppliers s ON s.id = dn.supplier_id
           LEFT JOIN products p ON p.id = dni.product_id`,
    date: 'dn.delivery_date',
    dateLabel: 'delivered',
    groups: {
      discrepancy: { label: 'Order match', sql: "CASE WHEN COALESCE(dni.discrepancy_quantity, 0) = 0 AND COALESCE(dni.discrepancy_weight_kg, 0) = 0 THEN 'matched' WHEN dni.discrepancy_resolved THEN 'discrepancy resolved' ELSE 'discrepancy open' END" },
      supplier:    { label: 'Supplier', sql: "COALESCE(s.name, 'No supplier')" },
      product:     { label: 'Product', sql: "COALESCE(p.name, 'Unknown')" },
      storage:     { label: 'Storage area', sql: "COALESCE(dni.storage_area, 'not set')" },
      month:       { label: 'Month', sql: month('dn.delivery_date'), time: true },
    },
    filters: {
      supplier_id: { label: 'Supplier', sql: 'dn.supplier_id', id: true },
      product_id:  { label: 'Product', sql: 'dni.product_id', id: true },
    },
    measures: {
      count: { label: 'Number of lines', sql: 'COUNT(*)', unit: 'lines' },
      kg:    { label: 'Weight received', sql: "COALESCE(SUM(CASE WHEN dni.received_weight_kg IS NOT NULL THEN dni.received_weight_kg WHEN dni.unit = 'kg' THEN dni.received_quantity END), 0)", unit: 'kg' },
    },
  },

  donations: {
    label: 'Donations',
    description: 'Donations recorded at intake. Counted in aggregate; donors are never listed.',
    from: `donations d`,
    date: local('d.received_at'),
    dateLabel: 'received',
    groups: {
      status:        { label: 'Record status', sql: "COALESCE(d.status, 'unknown')" },
      s18a_status:   { label: 'Section 18A status', sql: "COALESCE(d.section_18a_status, 'not_evaluated')" },
      category:      { label: 'Category', sql: "COALESCE(d.donation_category, 'uncategorised')" },
      donor_type:    { label: 'Donor type', sql: "COALESCE(d.donor_registration_type, 'not recorded')" },
      month:         { label: 'Month', sql: month(local('d.received_at')), time: true },
    },
    filters: {
      status: { label: 'Record status', sql: 'd.status', values: ['committed', 'draft'] },
      s18a_status: { label: 'Section 18A status', sql: 'd.section_18a_status', values: ['not_qualifying', 'not_evaluated', 'qualifying_pending_donor', 'queued', 'issued'] },
    },
    measures: {
      count: { label: 'Number of donations', sql: 'COUNT(*)', unit: 'donations' },
      value: { label: 'Estimated value', sql: 'COALESCE(SUM(d.estimated_value_zar), 0)', unit: 'ZAR' },
    },
  },

  community_requests: {
    label: 'Benevolent requests',
    description: 'Phoned-in and walk-in requests for food parcels. Callers are never listed.',
    from: `community_requests cr`,
    date: local('cr.requested_at'),
    dateLabel: 'requested',
    groups: {
      outcome: { label: 'Outcome', sql: 'cr.outcome::text' },
      month:   { label: 'Month', sql: month(local('cr.requested_at')), time: true },
    },
    filters: {
      outcome: { label: 'Outcome', sql: 'cr.outcome::text', values: ['pending', 'fulfilled', 'partially_fulfilled', 'declined', 'referred'] },
    },
    measures: { count: { label: 'Number of requests', sql: 'COUNT(*)', unit: 'requests' } },
  },

  compost: {
    label: 'Feed the Soil compost',
    description: 'Compost logged from collection kits.',
    from: `collection_kit_records r JOIN collection_kits k ON k.id = r.kit_id`,
    date: 'r.logged_at',
    dateLabel: 'logged',
    groups: {
      status: { label: 'Status', sql: 'r.status' },
      suburb: { label: 'Suburb', sql: "COALESCE(NULLIF(k.suburb, ''), 'Unspecified')" },
      month:  { label: 'Month', sql: month('r.logged_at'), time: true },
    },
    filters: {
      status: { label: 'Status', sql: 'r.status', values: ['logged', 'dispatched'] },
    },
    measures: {
      count: { label: 'Number of collections', sql: 'COUNT(*)', unit: 'collections' },
      kg:    { label: 'Compost', sql: 'COALESCE(SUM(r.kg_compost), 0)', unit: 'kg' },
    },
  },

  volunteer_events: {
    label: 'Volunteer events',
    description: 'Volunteer events and their status.',
    from: `love_activism_events ev`,
    date: 'ev.event_date',
    dateLabel: 'held',
    groups: {
      status: { label: 'Status', sql: 'ev.status' },
      month:  { label: 'Month', sql: month('ev.event_date'), time: true },
    },
    filters: {
      status: { label: 'Status', sql: 'ev.status', values: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'COMPLETED', 'CANCELLED'] },
    },
    measures: { count: { label: 'Number of events', sql: 'COUNT(*)', unit: 'events' } },
  },

  stock_movements: {
    label: 'Stock movements',
    description: 'Every movement in the stock ledger.',
    from: `stock_movements sm LEFT JOIN products p ON p.id = sm.product_id`,
    date: local('sm.created_at'),
    dateLabel: 'recorded',
    groups: {
      type:    { label: 'Movement type', sql: 'sm.movement_type' },
      product: { label: 'Product', sql: "COALESCE(p.name, 'Unknown')" },
      month:   { label: 'Month', sql: month(local('sm.created_at')), time: true },
    },
    filters: {
      type: { label: 'Movement type', sql: 'sm.movement_type', values: ['received', 'donated', 'dispatched', 'picked', 'wastage', 'adjustment', 'decanted'] },
      product_id: { label: 'Product', sql: 'sm.product_id', id: true },
    },
    measures: {
      count: { label: 'Number of movements', sql: 'COUNT(*)', unit: 'movements' },
      kg:    { label: 'Kilograms moved', sql: "COALESCE(SUM(ABS(sm.quantity)) FILTER (WHERE sm.unit = 'kg'), 0)", unit: 'kg' },
    },
  },

  beneficiaries: {
    label: 'Beneficiaries',
    description: 'The centres on record, as they stand today.',
    from: `ecd_centres e`,
    date: null,
    groups: {
      active: { label: 'Active or inactive', sql: "CASE WHEN e.is_active THEN 'active' ELSE 'inactive' END" },
      cohort: { label: 'Cohort', sql: "COALESCE(e.cohort::text, 'none')" },
      collection_day: { label: 'Collection day', sql: "COALESCE(e.collection_day::text, 'none')" },
      approved: { label: 'Approved?', sql: "CASE WHEN e.approved_at IS NULL THEN 'not approved' ELSE 'approved' END" },
    },
    filters: {
      active: { label: 'Active or inactive', sql: "CASE WHEN e.is_active THEN 'active' ELSE 'inactive' END", values: ['active', 'inactive'] },
    },
    measures: {
      count: { label: 'Number of centres', sql: 'COUNT(*)', unit: 'centres' },
      children: { label: 'Registered children', sql: 'COALESCE(SUM(e.child_count), 0)', unit: 'children' },
    },
  },

  products: {
    label: 'Products',
    description: 'The product catalogue, as it stands today.',
    from: `products p`,
    date: null,
    groups: {
      category:  { label: 'Category', sql: "COALESCE(NULLIF(p.category, ''), 'uncategorised')" },
      storage:   { label: 'Storage type', sql: "COALESCE(NULLIF(p.storage_type, ''), 'not set')" },
      active:    { label: 'Active or inactive', sql: "CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END" },
      perishable:{ label: 'Perishable?', sql: "CASE WHEN p.is_perishable THEN 'perishable' ELSE 'long-life' END" },
      complete:  { label: 'Details complete?', sql: "CASE WHEN p.unit_cost IS NULL OR p.weight_kg IS NULL THEN 'missing cost or weight' ELSE 'complete' END" },
    },
    filters: {
      active: { label: 'Active or inactive', sql: "CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END", values: ['active', 'inactive'] },
    },
    measures: { count: { label: 'Number of products', sql: 'COUNT(*)', unit: 'products' } },
  },

  // ── Areas the prepared reports do not reach ──────────────────
  // Each is one table, or one table and its parent, counted the same
  // way as the datasets above. None lists a person.

  decanting: {
    label: 'Decanting lines',
    description: 'Each product line on a decanting sheet: what was packed, how many bags, what was wasted, and whether the bags were within the weight margin.',
    from: `decanting_lines dl
           JOIN decanting_records dr ON dr.id = dl.decanting_id
           LEFT JOIN products p ON p.id = dl.product_id`,
    date: 'dr.week_of',
    dateLabel: 'decanted',
    groups: {
      product: { label: 'Product', sql: "COALESCE(p.name, 'Unknown')" },
      margin:  { label: 'Within margin?', sql: "CASE WHEN dl.within_margin THEN 'within margin' ELSE 'outside margin' END" },
      month:   { label: 'Month', sql: month('dr.week_of'), time: true },
      week:    { label: 'Week', sql: week('dr.week_of'), time: true },
    },
    filters: {
      margin: { label: 'Within margin?', sql: "CASE WHEN dl.within_margin THEN 'within margin' ELSE 'outside margin' END", values: ['within margin', 'outside margin'] },
      product_id: { label: 'Product', sql: 'dl.product_id', id: true },
    },
    measures: {
      count:   { label: 'Number of lines', sql: 'COUNT(*)', unit: 'lines' },
      packed:  { label: 'Packed', sql: 'COALESCE(SUM(dl.packed_kg), 0)', unit: 'kg' },
      wastage: { label: 'Wastage', sql: 'COALESCE(SUM(dl.wastage_kg), 0)', unit: 'kg' },
      bags:    { label: 'Bags packed', sql: 'COALESCE(SUM(dl.total_bags), 0)', unit: 'bags' },
    },
  },

  stock_counts: {
    label: 'Stock count lines',
    description: 'Each product counted in a stock count, and whether the count matched what the system held.',
    from: `stock_count_lines scl
           JOIN stock_counts sc ON sc.id = scl.stock_count_id
           LEFT JOIN products p ON p.id = scl.product_id`,
    date: 'sc.count_date',
    dateLabel: 'counted',
    groups: {
      result:  { label: 'Count result', sql: "CASE WHEN scl.variance IS NULL THEN 'not counted' WHEN scl.variance = 0 THEN 'matched' WHEN scl.variance > 0 THEN 'more than expected' ELSE 'less than expected' END" },
      product: { label: 'Product', sql: "COALESCE(p.name, 'Unknown')" },
      reason:  { label: 'Reason given', sql: "COALESCE(NULLIF(scl.reason_code, ''), 'no reason given')" },
      status:  { label: 'Count status', sql: 'sc.status::text' },
      month:   { label: 'Month', sql: month('sc.count_date'), time: true },
    },
    filters: {
      result: { label: 'Count result', sql: "CASE WHEN scl.variance IS NULL THEN 'not counted' WHEN scl.variance = 0 THEN 'matched' WHEN scl.variance > 0 THEN 'more than expected' ELSE 'less than expected' END", values: ['matched', 'more than expected', 'less than expected', 'not counted'] },
      product_id: { label: 'Product', sql: 'scl.product_id', id: true },
    },
    measures: {
      count:    { label: 'Number of lines', sql: 'COUNT(*)', unit: 'lines' },
      variance: { label: 'Units out', sql: 'COALESCE(SUM(ABS(scl.variance)), 0)', unit: 'units' },
    },
  },

  kits: {
    label: 'Feed the Soil kits',
    description: 'Every compost collection kit given to a household, as it stands now: by suburb, by when it was assigned, and whether it has ever logged compost. Owners are never listed.',
    from: `collection_kits k
           LEFT JOIN (SELECT kit_id, COUNT(*) AS logs FROM collection_kit_records GROUP BY kit_id) r ON r.kit_id = k.id`,
    date: null,
    groups: {
      suburb: { label: 'Suburb', sql: "COALESCE(NULLIF(k.suburb, ''), 'Unspecified')" },
      used:   { label: 'Compost logged?', sql: "CASE WHEN COALESCE(r.logs, 0) > 0 THEN 'has logged compost' ELSE 'nothing logged yet' END" },
      month:  { label: 'Month assigned', sql: month('k.assigned_at'), time: true },
    },
    filters: {
      used: { label: 'Compost logged?', sql: "CASE WHEN COALESCE(r.logs, 0) > 0 THEN 'has logged compost' ELSE 'nothing logged yet' END", values: ['has logged compost', 'nothing logged yet'] },
    },
    measures: { count: { label: 'Number of kits', sql: 'COUNT(*)', unit: 'kits' } },
  },

  reminders: {
    label: 'Collection reminders',
    description: 'Reminders sent to centres before their collection day, by email or WhatsApp, and whether they went.',
    from: `ecd_collection_reminders rm LEFT JOIN ecd_centres e ON e.id = rm.ecd_id`,
    date: 'rm.collection_date',
    dateLabel: 'for collection',
    groups: {
      status:  { label: 'Status', sql: 'LOWER(rm.status)' },
      channel: { label: 'Channel', sql: 'LOWER(rm.channel)' },
      centre:  { label: 'Centre', sql: "COALESCE(e.name, 'Unknown')" },
      month:   { label: 'Month', sql: month('rm.collection_date'), time: true },
    },
    filters: {
      status:  { label: 'Status', sql: 'LOWER(rm.status)', values: ['pending', 'sending', 'sent', 'failed', 'cancelled'] },
      channel: { label: 'Channel', sql: 'LOWER(rm.channel)', values: ['email', 'whatsapp'] },
    },
    measures: { count: { label: 'Number of reminders', sql: 'COUNT(*)', unit: 'reminders' } },
  },

  messages: {
    label: 'Emails and messages sent',
    description: 'Every email or message the system tried to send, by what it was and whether it went. Recipients are never listed.',
    from: `outbound_messages om`,
    date: local('om.attempted_at'),
    dateLabel: 'sent',
    groups: {
      status:  { label: 'Status', sql: 'om.status' },
      type:    { label: 'Kind of message', sql: "COALESCE(NULLIF(om.type, ''), 'other')" },
      channel: { label: 'Channel', sql: "COALESCE(NULLIF(om.channel, ''), 'other')" },
      month:   { label: 'Month', sql: month(local('om.attempted_at')), time: true },
    },
    filters: {
      status: { label: 'Status', sql: 'om.status', values: ['sent', 'stubbed', 'failed'] },
    },
    measures: { count: { label: 'Number of messages', sql: 'COUNT(*)', unit: 'messages' } },
  },

  activity: {
    label: 'Recorded actions',
    description: 'Actions written to the audit trail, by what was changed and what was done to it. Counted, never listed by person: the Activity log shows who did what.',
    from: `audit_log al`,
    date: local('al.created_at'),
    dateLabel: 'recorded',
    groups: {
      record: { label: 'Kind of record', sql: "REPLACE(al.entity_type, '_', ' ')" },
      action: { label: 'Action', sql: "REPLACE(al.action, '_', ' ')" },
      month:  { label: 'Month', sql: month(local('al.created_at')), time: true },
      weekday: { label: 'Day of the week', sql: weekdayOf(local('al.created_at')) },
    },
    filters: {},
    measures: { count: { label: 'Number of actions', sql: 'COUNT(*)', unit: 'actions' } },
  },

  visits: {
    label: 'Visitor sign-ins',
    description: 'People who signed in at the door as guests or volunteers, and the hours they were on site. Counted, never listed by name.',
    from: `volunteers v`,
    date: local('v.signed_in_at'),
    dateLabel: 'signed in',
    groups: {
      source:  { label: 'How they signed in', sql: "COALESCE(NULLIF(v.source, ''), 'not recorded')" },
      state:   { label: 'Signed out?', sql: "CASE WHEN v.signed_out_at IS NULL THEN 'still signed in' ELSE 'signed out' END" },
      month:   { label: 'Month', sql: month(local('v.signed_in_at')), time: true },
      weekday: { label: 'Day of the week', sql: weekdayOf(local('v.signed_in_at')) },
    },
    filters: {
      state: { label: 'Signed out?', sql: "CASE WHEN v.signed_out_at IS NULL THEN 'still signed in' ELSE 'signed out' END", values: ['still signed in', 'signed out'] },
    },
    measures: {
      count: { label: 'Number of sign-ins', sql: 'COUNT(*)', unit: 'sign-ins' },
      hours: { label: 'Hours on site', sql: 'COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (v.signed_out_at - v.signed_in_at)) / 3600.0) FILTER (WHERE v.signed_out_at > v.signed_in_at), 1), 0)', unit: 'hours' },
    },
  },

  suppliers: {
    label: 'Suppliers',
    description: 'The supplier list as it stands now: how many are active, and by category.',
    from: `suppliers s`,
    date: null,
    groups: {
      active:   { label: 'Active or inactive', sql: "CASE WHEN s.is_active THEN 'active' ELSE 'inactive' END" },
      category: { label: 'Category', sql: "COALESCE(NULLIF(s.category, ''), 'uncategorised')" },
      terms:    { label: 'Payment terms', sql: "COALESCE(NULLIF(s.payment_terms, ''), 'not set')" },
    },
    filters: {
      active: { label: 'Active or inactive', sql: "CASE WHEN s.is_active THEN 'active' ELSE 'inactive' END", values: ['active', 'inactive'] },
    },
    measures: { count: { label: 'Number of suppliers', sql: 'COUNT(*)', unit: 'suppliers' } },
  },
};

export const DATASET_IDS = Object.keys(DATASETS);
const MAX_ROWS = 200;
const MAX_RANGE_DAYS = 731;

/** The builder's and the AI's view of what can be asked for — no SQL. */
export const describeDatasets = () => Object.entries(DATASETS).map(([id, d]) => ({
  id,
  label: d.label,
  description: d.description,
  temporal: d.date ? 'range' : 'snapshot',
  groups: Object.entries(d.groups).map(([k, g]) => ({ id: k, label: g.label, time: Boolean(g.time) })),
  filters: Object.entries(d.filters).map(([k, f]) => ({ id: k, label: f.label, values: f.values ?? null, id_filter: Boolean(f.id) })),
  measures: Object.entries(d.measures).map(([k, m]) => ({ id: k, label: m.label, unit: m.unit })),
}));

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Check a custom spec against its dataset. Returns a clean copy with
 * only known keys. Throws a 400 naming what is allowed, so the model's
 * retry (or the person) can correct it.
 */
export const validateCustom = (input) => {
  const c = input?.custom ?? {};
  const ds = DATASETS[c.dataset];
  if (!ds) throw fail(400, `Unknown dataset "${c.dataset}". Choose one of: ${DATASET_IDS.join(', ')}.`);

  const groupBy = (Array.isArray(c.groupBy) ? c.groupBy : c.groupBy ? [c.groupBy] : []).filter(Boolean);
  if (groupBy.length > 2) throw fail(400, 'Group by at most two things.');
  for (const g of groupBy) {
    if (!ds.groups[g]) throw fail(400, `"${g}" is not a way to group ${ds.label.toLowerCase()}. Choose: ${Object.keys(ds.groups).join(', ')}.`);
  }
  if (new Set(groupBy).size !== groupBy.length) throw fail(400, 'Group by two different things.');

  const measure = c.measure || 'count';
  if (!ds.measures[measure]) throw fail(400, `"${measure}" is not a measure of ${ds.label.toLowerCase()}. Choose: ${Object.keys(ds.measures).join(', ')}.`);

  const filters = {};
  for (const [k, v] of Object.entries(c.filters ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    const f = ds.filters[k];
    if (!f) throw fail(400, `"${k}" is not a filter on ${ds.label.toLowerCase()}. Choose: ${Object.keys(ds.filters).join(', ') || 'none'}.`);
    if (f.id) {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw fail(400, `${f.label} must be an id.`);
      filters[k] = n;
    } else {
      if (!f.values.includes(String(v))) throw fail(400, `"${v}" is not a ${f.label.toLowerCase()}. Choose: ${f.values.join(', ')}.`);
      filters[k] = String(v);
    }
  }

  let dateRange;
  if (ds.date) {
    const r = input.dateRange;
    if (!r || !ISO.test(r.from ?? '') || !ISO.test(r.to ?? '')) throw fail(400, 'Choose a period (from and to dates, YYYY-MM-DD).');
    const days = (Date.parse(r.to) - Date.parse(r.from)) / 86400000;
    if (!(days >= 0)) throw fail(400, 'The start date must be on or before the end date.');
    if (days > MAX_RANGE_DAYS) throw fail(400, `Date range too wide. The maximum is ${MAX_RANGE_DAYS} days.`);
    dateRange = { from: r.from, to: r.to };
  }

  return {
    custom: { dataset: c.dataset, groupBy, measure, filters },
    dateRange,
    chartType: input.chartType,
  };
};

/** The SQL and parameters for a validated spec. Every fragment is ours. */
export const buildCustomSql = (spec) => {
  const ds = DATASETS[spec.custom.dataset];
  const m = ds.measures[spec.custom.measure];
  const params = [];
  const where = [];
  if (ds.date && spec.dateRange) {
    params.push(spec.dateRange.from, spec.dateRange.to);
    where.push(`(${ds.date})::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
  }
  for (const [k, v] of Object.entries(spec.custom.filters)) {
    params.push(v);
    where.push(`${ds.filters[k].sql} = $${params.length}`);
  }
  const groups = spec.custom.groupBy.map((g) => ds.groups[g].sql);
  const label = groups.length === 0 ? "'Total'"
    : groups.length === 1 ? `(${groups[0]})::text`
      : `(${groups[0]})::text || '|' || (${groups[1]})::text`;
  const timeFirst = spec.custom.groupBy.length && ds.groups[spec.custom.groupBy[0]].time;
  const sql = `SELECT ${label} AS label, (${m.sql})::float8 AS value
                 FROM ${ds.from}
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ${groups.length ? 'GROUP BY 1' : ''}
                ORDER BY ${timeFirst ? '1 ASC' : '2 DESC, 1 ASC'}
                LIMIT ${MAX_ROWS}`;
  return { sql, params };
};

const words = (s) => String(s).replace(/_/g, ' ');

/** "Picking slips by packing status and cohort, 2026-07-01 to 2026-09-27". */
export const describeCustom = (spec) => {
  const ds = DATASETS[spec.custom.dataset];
  const m = ds.measures[spec.custom.measure];
  const by = spec.custom.groupBy.map((g) => ds.groups[g].label.toLowerCase());
  const f = Object.entries(spec.custom.filters).map(([k, v]) => `${ds.filters[k].label.toLowerCase()} ${ds.filters[k].id ? `#${v}` : words(v)}`);
  const what = m.unit === 'ZAR' || m.unit === 'kg' || spec.custom.measure !== 'count' ? `${m.label} of ${ds.label.toLowerCase()}` : ds.label;
  return [
    what,
    by.length ? `by ${by.join(' and ')}` : '',
    f.length ? `where ${f.join(', ')}` : '',
    spec.dateRange ? `${spec.dateRange.from} to ${spec.dateRange.to}` : 'as it stands',
  ].filter(Boolean).join(', ').replace(/, by/, ' by').replace(/, where/, ' where');
};

/** Run a validated spec. `query` is pool.query, injectable for tests. */
export const runCustom = async (spec, query) => {
  const { sql, params } = buildCustomSql(spec);
  const { rows } = await query(sql, params);
  const ds = DATASETS[spec.custom.dataset];
  const m = ds.measures[spec.custom.measure];
  const series = rows.map((r) => ({ label: r.label ?? '-', value: Number(r.value ?? 0) }));
  const total = series.reduce((s, r) => s + r.value, 0);
  const g0 = spec.custom.groupBy[0];
  return {
    spec: {
      ...spec,
      // The chart reads `dimension` to decide between a time axis, a
      // ranked bar and a single figure; two groups draw stacked.
      dimension: spec.custom.groupBy.length === 0 ? 'none'
        : spec.custom.groupBy.length === 2 ? 'custom_two'
          : ds.groups[g0].time ? (g0 === 'week' ? 'week' : 'month') : 'custom',
      metric: `custom:${spec.custom.dataset}`,
    },
    description: describeCustom(spec),
    chartType: spec.chartType ?? (spec.custom.groupBy.length === 2 ? 'stacked_bar' : g0 && ds.groups[g0].time ? 'bar' : g0 ? 'hbar' : 'number'),
    series,
    total,
    meta: {
      unit: m.unit,
      custom: true,
      dataset: spec.custom.dataset,
      groupLabels: spec.custom.groupBy.map((g) => ds.groups[g].label),
      measureLabel: m.label,
      caveat: ds.date ? `Counted by the date ${ds.label.toLowerCase()} were ${ds.dateLabel}.` : 'As things stand today.',
      truncated: rows.length === MAX_ROWS,
      cached: false,
    },
  };
};

export default { DATASETS, DATASET_IDS, describeDatasets, validateCustom, buildCustomSql, describeCustom, runCustom };
