// ─────────────────────────────────────────────────────────────
// server/src/repositories/purchaseOrder.repository.js
//
// SQL only. What is allowed lives in purchaseOrder.service.js.
//
// EXPECTED FAILURES RETURN, THEY DO NOT THROW.
// createPurchaseOrder returns { ok: false, code } for an inactive
// supplier or an unknown product, following convertProspect in
// supplier.repository.js. Those are answers, not faults — the manager
// picked something she is not allowed to pick, and the service turns
// the code into a 400 she can act on. Only database faults throw.
//
// EVERY ARRAY PARAMETER IS CAST EXPLICITLY.
// unnest() with uncast parameters is where 42P08 "could not determine
// data type" comes from: pg sends untyped placeholders, Postgres has
// nothing to infer from inside unnest, and the statement dies at
// runtime having passed every mocked test.
// ─────────────────────────────────────────────────────────────
import pool           from '../config/db.js';
import { logAudit }   from './auditLog.repository.js';
import { createNotification } from './notification.repository.js';

// Named columns rather than SELECT *, so a column added later does not
// silently start crossing the API.
const PO_COLUMNS = `
  po.id,
  po.po_number,
  po.supplier_id,
  po.status,
  po.expected_delivery_date,
  po.notes,
  po.status_reason,
  po.status_changed_at,
  po.created_by,
  po.created_at
`;

// ── Create ────────────────────────────────────────────────────
// Header and lines in one transaction. A committed header with no
// lines is not merely untidy: delivery.service.getPurchaseOrderItems
// throws "No items found for this purchase order", so an empty PO
// would appear in the receiver's dropdown and then refuse to open.
const createPurchaseOrder = async (payload, userId) => {
  const { supplierId, expectedDeliveryDate, notes, quickbooksPoId, items } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR SHARE, not FOR UPDATE: this blocks a concurrent deactivation
    // of the supplier without blocking another manager raising a
    // second PO against the same one.
    const { rows: suppliers } = await client.query(
      `SELECT id, name, is_active FROM suppliers WHERE id = $1 FOR SHARE`,
      [supplierId]
    );
    const supplier = suppliers[0];
    if (!supplier) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'supplier_not_found' };
    }
    if (!supplier.is_active) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'supplier_inactive', supplier };
    }

    // BR-05: every line must resolve to a configured, active product.
    // One query for all of them — a 30-line PO would otherwise be 30
    // round trips to Supabase.
    const productIds = items.map((i) => i.productId);
    const { rows: products } = await client.query(
      `SELECT id, name, default_unit FROM products
        WHERE id = ANY($1::int[]) AND is_active = true`,
      [productIds]
    );

    if (products.length !== productIds.length) {
      const found   = new Set(products.map((p) => p.id));
      const missing = productIds.filter((id) => !found.has(id));
      await client.query('ROLLBACK');
      return { ok: false, code: 'unknown_products', missing };
    }

    // status is written as a literal, never taken from the payload.
    // BR-07B reserves status changes for the manager acting on an
    // existing PO, and a client that could post status:'received'
    // could book stock that never arrived.
    const { rows: created } = await client.query(
      `INSERT INTO purchase_orders
         (supplier_id, created_by, status, expected_delivery_date, notes)
       VALUES ($1, $2, 'pending', $3, $4)
       RETURNING ${PO_COLUMNS.replace(/po\./g, '')}`,
      [supplierId, userId, expectedDeliveryDate, notes]
    );
    const purchaseOrder = created[0];

    // Multi-row insert via unnest — one statement regardless of line
    // count. NULL survives for the two optional numerics because the
    // arrays carry nulls in place rather than omitting the keys.
    const { rows: lines } = await client.query(
      `INSERT INTO purchase_order_items
         (purchase_order_id, product_id, expected_quantity, expected_weight_kg, unit_price)
       SELECT $1::int, p, q, w, u
         FROM unnest($2::int[], $3::int[], $4::numeric[], $5::numeric[])
              AS t(p, q, w, u)
       RETURNING id, product_id, expected_quantity, expected_weight_kg, unit_price`,
      [
        purchaseOrder.id,
        productIds,
        items.map((i) => i.expectedQuantity),
        items.map((i) => i.expectedWeightKg ?? null),
        items.map((i) => i.unitPrice ?? null),
      ]
    );

    // Warehouse Visit 2.4: the WMS owns the PO number and QuickBooks
    // holds it as a reference. This row is that reference, and it is
    // the same row the QBO push will write once the spike lands — so
    // the manual fallback and the automated path converge instead of
    // needing reconciling later.
    if (quickbooksPoId) {
      await client.query(
        `INSERT INTO quickbooks_object_map
           (entity_type, entity_id, qbo_object_type, qbo_id)
         VALUES ('purchase_order', $1, 'PurchaseOrder', $2)`,
        [purchaseOrder.id, quickbooksPoId]
      );
    }

    await logAudit(client, {
      entityType: 'purchase_order',
      entityId:   purchaseOrder.id,
      action:     'created',
      actorId:    userId,
      after:      { ...purchaseOrder, items: lines },
    });

    await client.query('COMMIT');

    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      ok: true,
      purchaseOrder: {
        ...purchaseOrder,
        supplier_name:    supplier.name,
        quickbooks_po_id: quickbooksPoId ?? null,
        items: lines.map((l) => ({
          ...l,
          product_name: byId.get(l.product_id)?.name ?? null,
          default_unit: byId.get(l.product_id)?.default_unit ?? null,
        })),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── List ──────────────────────────────────────────────────────
// Filters are coalesced predicates rather than SQL built up in JS, so
// there is one query plan and no branch where a filter value reaches
// the statement text.
const listPurchaseOrders = async ({ status = null, supplierId = null, limit = 50 } = {}) => {
  const { rows } = await pool.query(
    `SELECT ${PO_COLUMNS},
            s.name AS supplier_name,
            u.first_name AS created_by_name,
            (SELECT COUNT(*) FROM purchase_order_items poi
              WHERE poi.purchase_order_id = po.id)::int AS line_count,
            (SELECT COALESCE(SUM(poi.expected_quantity * COALESCE(poi.unit_price, 0)), 0)
               FROM purchase_order_items poi
              WHERE poi.purchase_order_id = po.id) AS estimated_value,
            -- BR-07A: instalments are delivery_notes against this PO.
            (SELECT COUNT(*) FROM delivery_notes dn
              WHERE dn.purchase_order_id = po.id)::int AS receipt_count
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
      WHERE ($1::text IS NULL OR po.status = $1)
        AND ($2::int  IS NULL OR po.supplier_id = $2)
      ORDER BY po.created_at DESC
      LIMIT $3::int`,
    [status, supplierId, limit]
  );
  return rows;
};

// ── Detail ────────────────────────────────────────────────────
const getPurchaseOrderById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${PO_COLUMNS},
            s.name AS supplier_name,
            s.is_active AS supplier_is_active,
            u.first_name AS created_by_name,
            qom.qbo_id AS quickbooks_po_id
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
       LEFT JOIN quickbooks_object_map qom
              ON qom.entity_type = 'purchase_order'
             AND qom.entity_id = po.id
      WHERE po.id = $1`,
    [id]
  );
  const purchaseOrder = rows[0];
  if (!purchaseOrder) return null;

  // received_to_date comes from delivery_note_items joined back to the
  // PO line, which is what makes BR-07A work without a new table:
  // one PO, many delivery_notes, each with its own item rows.
  const { rows: items } = await pool.query(
    `SELECT poi.id, poi.product_id, poi.expected_quantity,
            poi.expected_weight_kg, poi.unit_price,
            p.name AS product_name,
            p.stock_keeping_unit AS sku,
            p.default_unit,
            COALESCE((
              SELECT SUM(dni.received_quantity)
                FROM delivery_note_items dni
               WHERE dni.purchase_order_item_id = poi.id
            ), 0) AS received_to_date
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
      WHERE poi.purchase_order_id = $1
      ORDER BY p.name ASC`,
    [id]
  );

  return { ...purchaseOrder, items };
};

// ── Status transition ────────────────────────────────────────
// status_reason is cleared (not merely left) on every transition
// that isn't 'returned' — a stale return reason must not survive
// onto a PO that has since moved past it and read as if it still
// applies.
//
// Runs in its own transaction (rather than a bare pool.query) purely
// so the notification for 'returned'/'follow_up_required' can use
// createNotification, which — like logAudit — requires the caller's
// client so a notification can never survive a change that itself
// got rolled back.
const updatePurchaseOrderStatus = async (id, status, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE purchase_orders
          SET status = $2,
              status_reason = $3,
              status_changed_at = NOW()
        WHERE id = $1
        RETURNING ${PO_COLUMNS.replace(/po\./g, '')}`,
      [id, status, status === 'returned' ? reason : null]
    );
    const po = rows[0] ?? null;

    if (po && (status === 'returned' || status === 'follow_up_required')) {
      await createNotification(client, {
        type:       'purchase_order_needs_attention',
        title:      `Purchase order ${po.po_number} ${status === 'returned' ? 'returned' : 'needs follow-up'}`,
        body:       reason ?? null,
        entityType: 'purchase_order',
        entityId:   id,
      });
    }

    await client.query('COMMIT');
    return po;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
};
