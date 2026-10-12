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
    `SELECT sm.product_id, p.name AS product_name, sm.quantity, sm.movement_type, sm.created_at
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
      WHERE ${SAST_DAY('sm.created_at')} <= $1::date
      ORDER BY sm.created_at ASC, sm.id ASC`,
    [to],
  );
  return rows;
};

export default { listOrders, listSlips, listSlipEvents, listMovements };
