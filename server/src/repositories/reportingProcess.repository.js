// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingProcess.repository.js
//
// The rows process mining is worked out from. Read-only, and nothing
// is calculated here: features/reporting/processMining.js turns these
// into the map.
//
// WHICH CASES A PERIOD HOLDS
//   purchase orders  raised in the period
//   pallets          booked for dispatch in the period
//   stock            every movement up to the end of the period. What
//                    left in the period is measured against the oldest
//                    stock still there, and that depends on everything
//                    that came before it.
// Days are South African days throughout.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const SAST_DAY = (col) => `(${col} AT TIME ZONE 'Africa/Johannesburg')::date`;

/** Orders raised in [from, to], with their deliveries and when they were approved. */
export const listOrders = async ({ from, to, supplierId = null }) => {
  const { rows } = await pool.query(
    `SELECT po.id, po.po_number, po.status, po.created_at, po.status_changed_at,
            po.expected_delivery_date, s.name AS supplier_name,
            d.first_delivery, d.last_delivery, COALESCE(d.deliveries, 0)::int AS deliveries,
            a.approved_at
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN LATERAL (
         SELECT MIN(dn.created_at) AS first_delivery, MAX(dn.created_at) AS last_delivery, COUNT(*) AS deliveries
           FROM delivery_notes dn WHERE dn.purchase_order_id = po.id
       ) d ON TRUE
       LEFT JOIN LATERAL (
         SELECT MIN(al.created_at) AS approved_at
           FROM audit_log al
          WHERE al.entity_type = 'purchase_order' AND al.entity_id = po.id::text
            AND al.action = 'status_changed' AND al.after_data->>'status' = 'approved'
       ) a ON TRUE
      WHERE ${SAST_DAY('po.created_at')} BETWEEN $1::date AND $2::date
        AND ($3::int IS NULL OR po.supplier_id = $3)
      ORDER BY po.created_at ASC`,
    [from, to, supplierId],
  );
  return rows;
};

/** Pallets booked for [from, to], with how the gate ended. */
export const listSlips = async ({ from, to, cohort = null, beneficiaryKind = null }) => {
  const { rows } = await pool.query(
    `SELECT ps.id, COALESCE(e.name, ps.beneficiary_name) AS name, ps.cohort::text AS cohort,
            ps.beneficiary_kind::text AS beneficiary_kind, ps.status, ps.dispatch_date::text AS dispatch_date,
            ps.created_at, ps.completed_at, de.collected_at, de.status AS gate_status
       FROM picking_slips ps
       LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
       LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
      WHERE ps.dispatch_date BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR ps.cohort::text = $3)
        AND ($4::text IS NULL OR ps.beneficiary_kind::text = $4)
      ORDER BY ps.id ASC`,
    [from, to, cohort, beneficiaryKind],
  );
  return rows;
};

/** Every recorded step on those pallets, oldest first. */
export const listSlipEvents = async (slipIds) => {
  if (!slipIds.length) return [];
  const { rows } = await pool.query(
    `SELECT pe.picking_slip_id, pe.event_type, pe.created_at
       FROM picking_events pe
      WHERE pe.picking_slip_id = ANY($1::int[])
      ORDER BY pe.created_at ASC, pe.id ASC`,
    [slipIds],
  );
  return rows;
};

/** Every stock movement up to the end of `to`, oldest first. */
export const listMovements = async ({ to }) => {
  const { rows } = await pool.query(
    `SELECT sm.id, sm.product_id, p.name AS product_name, sm.quantity, sm.movement_type,
            sm.reference_type, sm.reference_id, sm.created_at
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
      WHERE ${SAST_DAY('sm.created_at')} <= $1::date
      ORDER BY sm.created_at ASC, sm.id ASC`,
    [to],
  );
  return rows;
};

// ── The flow map: every step of each order, not only the measured ones ──

/** Each logged status change on those orders, oldest first. */
export const listOrderChanges = async (orderIds) => {
  if (!orderIds.length) return [];
  const { rows } = await pool.query(
    `SELECT al.entity_id::int AS purchase_order_id, al.before_data->>'status' AS from_status,
            al.after_data->>'status' AS to_status, al.created_at
       FROM audit_log al
      WHERE al.entity_type = 'purchase_order' AND al.action = 'status_changed'
        AND al.entity_id = ANY($1::text[])
      ORDER BY al.created_at ASC`,
    [orderIds.map(String)],
  );
  return rows;
};

/** Each delivery against those orders, oldest first. */
export const listOrderDeliveries = async (orderIds) => {
  if (!orderIds.length) return [];
  const { rows } = await pool.query(
    `SELECT dn.id, dn.purchase_order_id, dn.status, dn.created_at
       FROM delivery_notes dn
      WHERE dn.purchase_order_id = ANY($1::int[])
      ORDER BY dn.created_at ASC, dn.id ASC`,
    [orderIds],
  );
  return rows;
};

/** Follow-up orders raised for what those orders were short. */
export const listFollowUps = async (orderIds) => {
  if (!orderIds.length) return [];
  try {
    const { rows } = await pool.query(
      `SELECT po.follow_up_of, po.created_at
         FROM purchase_orders po
        WHERE po.follow_up_of = ANY($1::int[])
        ORDER BY po.created_at ASC`,
      [orderIds],
    );
    return rows;
  } catch (err) {
    // A database that has not had migration 043 yet has no follow-up
    // orders to show. The rest of the map still stands.
    if (err.code === '42703') return [];
    throw err;
  }
};

// A deployment that has not had a feature's migration yet has no such
// table or column. That process is simply empty; the rest still draw.
const orNone = async (run) => {
  try {
    return (await run()).rows;
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return [];
    throw err;
  }
};

/** Donations received in [from, to]. */
export const listDonations = ({ from, to }) => orNone(() => pool.query(
  `SELECT d.id, d.donor_name, d.status, d.section_18a_status, d.section_18a_issued_at, d.received_at,
          ${SAST_DAY('d.received_at')}::text AS received_day
     FROM donations d
    WHERE ${SAST_DAY('d.received_at')} BETWEEN $1::date AND $2::date
    ORDER BY d.received_at ASC`,
  [from, to],
));

/** The lines of those donations, with when each was classified. */
export const listDonationItems = (donationIds) => (donationIds.length ? orNone(() => pool.query(
  `SELECT di.donation_id, di.routing_status, di.resolved_at
     FROM donation_items di
    WHERE di.donation_id = ANY($1::int[])`,
  [donationIds],
)) : Promise.resolve([]));

/** Benevolent requests logged in [from, to]. */
export const listRequests = ({ from, to }) => orNone(() => pool.query(
  `SELECT cr.id, cr.caller_name, cr.items_requested, cr.outcome::text AS outcome, cr.requested_at, cr.resolved_at
     FROM community_requests cr
    WHERE ${SAST_DAY('cr.requested_at')} BETWEEN $1::date AND $2::date
    ORDER BY cr.requested_at ASC`,
  [from, to],
));

/** Each time a decision on one of those requests was reversed. */
export const listRequestReversals = (requestIds) => (requestIds.length ? orNone(() => pool.query(
  `SELECT al.entity_id::int AS request_id, al.created_at
     FROM audit_log al
    WHERE al.entity_type = 'community_request' AND al.action = 'reversed'
      AND al.entity_id = ANY($1::text[])
    ORDER BY al.created_at ASC`,
  [requestIds.map(String)],
)) : Promise.resolve([]));

export default {
  listOrders, listSlips, listSlipEvents, listMovements, listOrderChanges, listOrderDeliveries, listFollowUps,
  listDonations, listDonationItems, listRequests, listRequestReversals,
};
