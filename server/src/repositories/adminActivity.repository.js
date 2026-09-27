// ─────────────────────────────────────────────────────────────
// server/src/repositories/adminActivity.repository.js
//
// Two read-only admin views, built from what the system already records.
//
// ACTIVITY — who did what, one timeline. There is an audit_log, but
// only a few features write to it; most actions are recorded on their
// own rows (picking_events.actor_id, stock_movements.performed_by,
// purchase_orders.created_by, …). Each source below is one SELECT with
// the same columns, UNION ALL'd, then filtered by date and person:
//   source   — which table it came from (the service words it)
//   at       — when
//   actor_id — who (NULL: the system, e.g. a scheduled sweep)
//   verb     — what happened, in that table's own terms
//   subject  — what it happened to (a centre, product, supplier…)
//   screen / record_id — where to open it
//   detail   — the few extra fields worth showing
// Stock movements are limited to adjustments: receiving, dispatch and
// donations each already appear from their own table. audit_log rows
// that another source already covers are left out, so nothing is
// counted twice.
//
// ARCHIVE — everything switched off or deleted: deactivated
// (is_active = false) or deleted (archived_at set, which by design
// cannot be undone for users, products and suppliers).
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const SOURCES = `
  SELECT 'picking' AS source, pe.created_at AS at, pe.actor_id, pe.event_type AS verb,
         COALESCE(e.name, ps.beneficiary_name) AS subject, 'pickingSlips' AS screen, ps.id::text AS record_id,
         jsonb_build_object('dispatch_date', ps.dispatch_date) AS detail
    FROM picking_events pe
    JOIN picking_slips ps ON ps.id = pe.picking_slip_id
    LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
   WHERE pe.event_type <> 'generated'

  UNION ALL
  -- Generating the week's slips writes one event per slip; one line per run.
  SELECT 'picking', MIN(pe.created_at), pe.actor_id, 'generated_batch',
         COUNT(*)::text || CASE WHEN COUNT(*) = 1 THEN ' slip' ELSE ' slips' END, 'pickingSlips', NULL,
         jsonb_build_object('dispatch_date', MIN(ps.dispatch_date))
    FROM picking_events pe
    JOIN picking_slips ps ON ps.id = pe.picking_slip_id
   WHERE pe.event_type = 'generated'
   GROUP BY pe.actor_id, date_trunc('minute', pe.created_at)

  UNION ALL
  SELECT 'dispatch', de.created_at, de.dispatched_by, de.status,
         COALESCE(e.name, ps.beneficiary_name), 'pickingSlips', ps.id::text, NULL
    FROM dispatch_events de
    JOIN picking_slips ps ON ps.id = de.picking_slip_id
    LEFT JOIN ecd_centres e ON e.id = ps.ecd_id

  UNION ALL
  SELECT 'stock', sm.created_at, sm.performed_by, sm.movement_type, p.name, 'stockLedger', NULL,
         jsonb_build_object('quantity', sm.quantity, 'unit', sm.unit, 'reason', sm.reason)
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
   WHERE sm.movement_type = 'adjustment'

  UNION ALL
  SELECT 'purchasing', po.created_at, po.created_by, 'created', COALESCE(po.po_number, 'PO ' || po.id),
         'purchaseOrders', po.id::text, jsonb_build_object('status', po.status)
    FROM purchase_orders po

  UNION ALL
  SELECT 'receiving', dn.created_at, dn.received_by, 'received', s.name, 'receipts', NULL,
         jsonb_build_object('status', dn.status, 'delivery_date', dn.delivery_date)
    FROM delivery_notes dn
    JOIN suppliers s ON s.id = dn.supplier_id

  UNION ALL
  SELECT 'donations', d.created_at, COALESCE(d.received_by, d.created_by), 'recorded', 'Donation #' || d.id,
         NULL, NULL, jsonb_build_object('value', d.estimated_value_zar, 'category', d.donation_category)
    FROM donations d

  UNION ALL
  SELECT 'decanting', dr.created_at, dr.recorded_by, 'recorded', 'Week of ' || dr.week_of::text, 'decantingRecords', NULL, NULL
    FROM decanting_records dr

  UNION ALL
  SELECT 'compost', ckr.created_at, ckr.logged_by, 'logged', 'Kit #' || ckr.kit_id || COALESCE(' (' || ck.suburb || ')', ''),
         'feedTheSoil', NULL, jsonb_build_object('kg', ckr.kg_compost)
    FROM collection_kit_records ckr
    LEFT JOIN collection_kits ck ON ck.id = ckr.kit_id

  UNION ALL
  SELECT 'volunteers', ev.created_at, ev.created_by, 'created', ev.event_name, 'volunteerEvent', ev.event_id::text, NULL
    FROM love_activism_events ev

  UNION ALL
  SELECT 'stock', f.created_at, f.created_by, 'flagged', p.name, NULL, NULL,
         jsonb_build_object('reason', f.reason, 'quantity', f.quantity_kg, 'unit', 'kg')
    FROM warehouse_manager_flags f
    LEFT JOIN products p ON p.id = f.product_id

  UNION ALL
  SELECT 'stock', sc.started_at, sc.started_by, 'count_started', 'Stock count ' || sc.count_date::text, 'stockLedger', NULL, NULL
    FROM stock_counts sc WHERE sc.started_at IS NOT NULL
  UNION ALL
  SELECT 'stock', sc.approved_at, sc.approved_by, 'count_approved', 'Stock count ' || sc.count_date::text, 'stockLedger', NULL, NULL
    FROM stock_counts sc WHERE sc.approved_at IS NOT NULL

  UNION ALL
  SELECT 'admin', s.created_at, s.created_by, 'supplier_added', s.name, 'suppliers', s.id::text, NULL
    FROM suppliers s WHERE s.created_by IS NOT NULL
  UNION ALL
  SELECT 'admin', s.archived_at, s.archived_by, 'supplier_deleted', s.name, 'suppliers', s.id::text, NULL
    FROM suppliers s WHERE s.archived_at IS NOT NULL
  UNION ALL
  SELECT 'admin', p.archived_at, p.archived_by, 'product_deleted', p.name, 'products', p.id::text, NULL
    FROM products p WHERE p.archived_at IS NOT NULL
  UNION ALL
  SELECT 'admin', u.archived_at, u.archived_by, 'user_deleted', u.username, 'users', u.id::text, NULL
    FROM users u WHERE u.archived_at IS NOT NULL

  UNION ALL
  SELECT 'audit', a.created_at, a.actor_id, a.action, a.entity_type, NULL, a.entity_id,
         jsonb_build_object('entity_type', a.entity_type, 'reason', a.reason,
                            'before', a.before_data, 'after', a.after_data)
    FROM audit_log a
   WHERE NOT (a.entity_type = 'donation'            AND a.action = 'donation_received')
     AND NOT (a.entity_type = 'product'             AND a.action = 'archived')
     AND NOT (a.entity_type = 'purchase_order'      AND a.action = 'created')
     AND NOT (a.entity_type = 'love_activism_event' AND a.action = 'CREATE')`;

/**
 * The timeline for [from, to] (dates, SAST, inclusive), newest first.
 * `actorId` narrows it to one person; `system` true to only the
 * system's own entries (no person).
 */
const listActivity = async ({ from, to, actorId = null, limit = 2000 }) => {
  const params = [from, to];
  let who = '';
  if (actorId === 'system') who = 'AND a.actor_id IS NULL';
  else if (actorId) { params.push(actorId); who = `AND a.actor_id = $${params.length}`; }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT a.*, u.username, trim(concat_ws(' ', u.first_name, u.last_name)) AS actor_name, u.role AS actor_role
       FROM (${SOURCES}) a
       LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.at IS NOT NULL
        AND (a.at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
        ${who}
      ORDER BY a.at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
};

// ── Archive ───────────────────────────────────────────────────
// kind + id is what Restore acts on; `restorable` mirrors the rules the
// status endpoints enforce (a deleted user/product/supplier cannot come
// back; the other kinds have no reactivation screen yet).
const ARCHIVE = `
  SELECT 'user' AS kind, u.id::text AS id,
         COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS name,
         u.username || ' · ' || u.role AS detail,
         CASE WHEN u.archived_at IS NOT NULL THEN 'deleted' ELSE 'deactivated' END AS state,
         u.archived_at AS at, u.archived_by AS by_id
    FROM users u WHERE u.is_active = false OR u.archived_at IS NOT NULL
  UNION ALL
  SELECT 'product', p.id::text, p.name, NULL,
         CASE WHEN p.archived_at IS NOT NULL THEN 'deleted' ELSE 'deactivated' END,
         p.archived_at, p.archived_by
    FROM products p WHERE p.is_active = false OR p.archived_at IS NOT NULL
  UNION ALL
  SELECT 'supplier', s.id::text, s.name, NULL,
         CASE WHEN s.archived_at IS NOT NULL THEN 'deleted' ELSE 'deactivated' END,
         COALESCE(s.archived_at, s.deactivated_at), s.archived_by
    FROM suppliers s WHERE s.is_active = false OR s.archived_at IS NOT NULL
  UNION ALL
  SELECT 'beneficiary', e.id::text, e.name, e.location, 'deactivated', NULL, NULL
    FROM ecd_centres e WHERE e.is_active = false
  UNION ALL
  SELECT 'programme', pr.id::text, pr.name, pr.code, 'deactivated', NULL, NULL
    FROM programmes pr WHERE pr.is_active = false
  UNION ALL
  SELECT 'storage_location', l.id::text, l.name, l.area::text, 'deactivated', NULL, NULL
    FROM storage_locations l WHERE l.is_active = false
  UNION ALL
  SELECT 'event_space', sp.space_id::text, sp.space_name, sp.location, 'deactivated', sp.updated_at, NULL
    FROM event_spaces sp WHERE sp.is_active = false`;

const listArchived = async () => {
  const { rows } = await pool.query(
    `SELECT x.*, trim(concat_ws(' ', u.first_name, u.last_name)) AS by_name
       FROM (${ARCHIVE}) x
       LEFT JOIN users u ON u.id = x.by_id
      ORDER BY x.at DESC NULLS LAST, x.kind, x.name`
  );
  return rows;
};

export default { listActivity, listArchived };
