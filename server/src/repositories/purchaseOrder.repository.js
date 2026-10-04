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
import { safeFinanceEmailError } from '../utils/financeEmailError.js';
import { buildState, classifyPair } from '../utils/quickbooksImport.js';

const QBO_UNIQUE_CONSTRAINT = 'qbo_map_unique_remote';

// UNIQUE (qbo_object_type, qbo_id): one QuickBooks PO number can be
// linked to only one PO here. Turns that violation into a 409 naming the
// PO that already holds it. Must run after ROLLBACK, on a client that
// is out of the failed transaction.
const duplicateLinkError = async (client, quickbooksPoId) => {
  const { rows } = await client.query(
    `SELECT po.po_number
       FROM quickbooks_object_map qom
       JOIN purchase_orders po ON po.id = qom.entity_id
      WHERE qom.entity_type = 'purchase_order'
        AND qom.qbo_object_type = 'PurchaseOrder'
        AND qom.qbo_id = $1
      LIMIT 1`,
    [quickbooksPoId]
  );
  const other = rows[0]?.po_number;
  const err = new Error(other
    ? `QuickBooks PO number ${quickbooksPoId} is already linked to ${other}. Enter a different number.`
    : `QuickBooks PO number ${quickbooksPoId} is already linked to another purchase order. Enter a different number.`);
  err.status = 409;
  return err;
};

const isDuplicateLink = (err) =>
  err?.code === '23505' && err.constraint === QBO_UNIQUE_CONSTRAINT;

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
    if (quickbooksPoId && isDuplicateLink(err)) throw await duplicateLinkError(client, quickbooksPoId);
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
            -- Lines whose full expected quantity has arrived, summed
            -- over every delivery against them. The "n of m received"
            -- the list shows; partially_received is not written
            -- automatically (see delivery.repository.js), so the status
            -- alone cannot say how far an order has got.
            (SELECT COUNT(*) FROM purchase_order_items poi
              WHERE poi.purchase_order_id = po.id
                AND COALESCE((SELECT SUM(dni.received_quantity)
                                FROM delivery_note_items dni
                               WHERE dni.purchase_order_item_id = poi.id), 0)
                    >= poi.expected_quantity)::int AS received_line_count,
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
            qom.qbo_id AS quickbooks_po_id,
            po.finance_email_status,
            po.finance_email_error,
            po.finance_email_attempted_at
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
  // Whatever is stored, only a short safe message leaves the repository.
  purchaseOrder.finance_email_error = safeFinanceEmailError(purchaseOrder.finance_email_error);

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

  // Every delivery actually recorded against this PO, oldest first —
  // real events for the PO detail's timeline (order raised, then one
  // entry per delivery, then wherever status sits today), not a
  // fabricated status history. There is no per-transition log of past
  // status changes (only status_changed_at, the most recent one), so
  // the timeline is built from what's actually there: this table plus
  // the PO's own created_at/status_changed_at.
  const { rows: deliveries } = await pool.query(
    `SELECT dn.id, dn.delivery_date, dn.status, dn.driver_name,
            u.first_name AS received_by_name,
            COALESCE(disc.discrepancy_count, 0) > 0 AS has_discrepancies
       FROM delivery_notes dn
       LEFT JOIN users u ON u.id = dn.received_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE dni.discrepancy_quantity <> 0) AS discrepancy_count
           FROM delivery_note_items dni
          WHERE dni.delivery_note_id = dn.id
       ) disc ON true
      WHERE dn.purchase_order_id = $1
      ORDER BY dn.delivery_date ASC, dn.id ASC`,
    [id]
  );

  return { ...purchaseOrder, items, deliveries };
};

// ── Status transition ────────────────────────────────────────
// status_reason is cleared (not merely left) on every transition
// that isn't 'returned' — a stale return reason must not survive
// onto a PO that has since moved past it and read as if it still
// applies.
//
// Runs in its own transaction (rather than a bare pool.query) so the
// service's notification for 'returned'/'follow_up_required' — passed
// in as beforeCommit — goes in with the status change or not at all.
//
// The reason is kept for both of those statuses: it is what the order
// shows as needing attention. Every other status clears it, so a
// reopened order does not keep an old complaint.
const updatePurchaseOrderStatus = async (id, status, reason, { beforeCommit } = {}) => {
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
      [id, status, (status === 'returned' || status === 'follow_up_required') ? reason : null]
    );
    const po = rows[0] ?? null;

    if (beforeCommit) await beforeCommit(client, { purchaseOrder: po, status, reason });

    await client.query('COMMIT');
    return po;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── QuickBooks reference ─────────────────────────────────────
// Sponsor feedback: QuickBooks integration was scoped to dispatch/
// invoice only. The manual reference createPurchaseOrder already
// accepts was write-once — there was no way to attach it once a PO
// existed, which is the common case (the QBO number is only known
// once the order has actually been entered into QuickBooks, after
// it is raised here). This gives that same row an update path.
//
// Delete-then-insert rather than INSERT ... ON CONFLICT: no unique
// index on (entity_type, entity_id) is defined anywhere in this
// codebase's tracked schema, so an upsert can't safely assume one
// exists. A null/blank quickbooksPoId clears the link (delete only,
// no re-insert) — unlinking is a real state, not an error.
const setQuickbooksReference = async (id, quickbooksPoId, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `DELETE FROM quickbooks_object_map
        WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [id]
    );

    if (quickbooksPoId) {
      await client.query(
        `INSERT INTO quickbooks_object_map
           (entity_type, entity_id, qbo_object_type, qbo_id)
         VALUES ('purchase_order', $1, 'PurchaseOrder', $2)`,
        [id, quickbooksPoId]
      );
    }

    await logAudit(client, {
      entityType: 'purchase_order',
      entityId:   id,
      action:     'quickbooks_ref_set',
      actorId,
      after:      { quickbooksPoId },
    });

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    if (quickbooksPoId && isDuplicateLink(err)) throw await duplicateLinkError(client, quickbooksPoId);
    throw err;
  } finally {
    client.release();
  }
};

// ── QuickBooks links import ──────────────────────────────────
// Two statements however many rows: our POs by number, then every link
// on those POs or holding those QuickBooks numbers. Never one query per
// row. LEFT JOIN so a link whose PO has been deleted still counts as
// the holder of its number (the unique index would block the insert
// regardless).
const loadImportState = async (db, poNumbers, qbNumbers, { lock = false } = {}) => {
  const { rows: poRows } = await db.query(
    `SELECT id, po_number
       FROM purchase_orders
      WHERE po_number = ANY($1::text[])
      ORDER BY id
      ${lock ? 'FOR UPDATE' : ''}`,
    [poNumbers]
  );
  const { rows: linkRows } = await db.query(
    `SELECT qom.entity_id, qom.qbo_id, po.po_number
       FROM quickbooks_object_map qom
       LEFT JOIN purchase_orders po ON po.id = qom.entity_id
      WHERE qom.entity_type = 'purchase_order'
        AND qom.qbo_object_type = 'PurchaseOrder'
        AND (qom.entity_id = ANY($1::int[]) OR qom.qbo_id = ANY($2::text[]))`,
    [poRows.map((r) => r.id), qbNumbers]
  );
  return buildState(poRows, linkRows);
};

// pairs: [{ poNumber, quickbooksNumber }] already normalised.
// → [{ status, linkedQuickbooksNumber?, linkedToPoNumber? }] in order.
const previewQuickbooksLinks = async (pairs) => {
  const state = await loadImportState(
    pool,
    [...new Set(pairs.map((p) => p.poNumber))],
    [...new Set(pairs.map((p) => p.quickbooksNumber))]
  );
  return pairs.map((p) => classifyPair(p, state));
};

// pairs: [{ poNumber, quickbooksNumber, overwrite }] already normalised
// and free of duplicates. All or nothing: one transaction, the POs
// locked first, everything re-classified against the locked data, then
// one DELETE, one INSERT and one audit INSERT whatever the row count.
// The audit rows are the same quickbooks_ref_set rows the manual edit
// writes, plus a reason, and one for each PO whose link was displaced.
// → [{ status: linked | overwritten | unchanged | skipped_conflict | not_found, ... }]
const applyQuickbooksLinks = async (pairs, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const state = await loadImportState(
      client,
      [...new Set(pairs.map((p) => p.poNumber))],
      [...new Set(pairs.map((p) => p.quickbooksNumber))],
      { lock: true }
    );

    const results = [];
    const deleteIds = new Set();
    const inserts = []; // { poId, qb }
    const audits  = []; // { poId, qb } — qb null = link removed
    for (const pair of pairs) {
      const c = classifyPair(pair, state);
      if (c.status === 'not_found' || c.status === 'unchanged') {
        results.push({ status: c.status });
        continue;
      }
      if (c.status === 'conflict' && !pair.overwrite) {
        results.push({ status: 'skipped_conflict', linkedQuickbooksNumber: c.linkedQuickbooksNumber, linkedToPoNumber: c.linkedToPoNumber });
        continue;
      }
      deleteIds.add(c.poId);
      inserts.push({ poId: c.poId, qb: pair.quickbooksNumber });
      audits.push({ poId: c.poId, qb: pair.quickbooksNumber });
      if (c.displacedPoId) {
        deleteIds.add(c.displacedPoId);
        audits.push({ poId: c.displacedPoId, qb: null });
      }
      results.push({ status: c.status === 'conflict' ? 'overwritten' : 'linked' });
    }

    if (inserts.length) {
      await client.query(
        `DELETE FROM quickbooks_object_map
          WHERE entity_type = 'purchase_order' AND entity_id = ANY($1::int[])`,
        [[...deleteIds]]
      );
      await client.query(
        `INSERT INTO quickbooks_object_map
           (entity_type, entity_id, qbo_object_type, qbo_id)
         SELECT 'purchase_order', t.po_id, 'PurchaseOrder', t.qb
           FROM unnest($1::int[], $2::text[]) AS t(po_id, qb)`,
        [inserts.map((r) => r.poId), inserts.map((r) => r.qb)]
      );
      await client.query(
        `INSERT INTO audit_log
           (entity_type, entity_id, action, actor_id, reason, after_data)
         SELECT 'purchase_order', t.po_id::text, 'quickbooks_ref_set', $3::int,
                'QuickBooks import', jsonb_build_object('quickbooksPoId', t.qb)
           FROM unnest($1::int[], $2::text[]) AS t(po_id, qb)`,
        [audits.map((r) => r.poId), audits.map((r) => r.qb), actorId]
      );
    }

    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Update (pending only) ───────────────────────────────────────
// Full header-and-lines replace, only ever reached for a 'pending'
// order — see purchaseOrder.service.js's updatePurchaseOrder, which
// is the actual gate. Nothing has been received against a pending
// order yet (that's what 'pending' means: raised, not yet approved,
// not yet sent to anyone), so there is no delivery_note_item pointing
// at the old line rows and replace-all is safe — the same reasoning
// deletePurchaseOrder below relies on. Supplier and products are
// re-validated fresh, same as createPurchaseOrder: either could have
// been deactivated in the time since the PO was first raised.
const updatePurchaseOrder = async (id, payload, userId) => {
  const { supplierId, expectedDeliveryDate, notes, items } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      `SELECT ${PO_COLUMNS.replace(/po\./g, '')} FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const before = existingRows[0] ?? null;
    if (!before) { await client.query('ROLLBACK'); return { ok: false, code: 'not_found' }; }
    if (before.status !== 'pending') {
      await client.query('ROLLBACK');
      return { ok: false, code: 'not_editable', status: before.status };
    }

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

    const { rows: updated } = await client.query(
      `UPDATE purchase_orders
          SET supplier_id = $2, expected_delivery_date = $3, notes = $4
        WHERE id = $1
        RETURNING ${PO_COLUMNS.replace(/po\./g, '')}`,
      [id, supplierId, expectedDeliveryDate, notes]
    );
    const purchaseOrder = updated[0];

    // Replace-all rather than a diff: simpler, and safe only because
    // 'pending' guarantees no delivery_note_item references these rows.
    await client.query(`DELETE FROM purchase_order_items WHERE purchase_order_id = $1`, [id]);
    const { rows: lines } = await client.query(
      `INSERT INTO purchase_order_items
         (purchase_order_id, product_id, expected_quantity, expected_weight_kg, unit_price)
       SELECT $1::int, p, q, w, u
         FROM unnest($2::int[], $3::int[], $4::numeric[], $5::numeric[])
              AS t(p, q, w, u)
       RETURNING id, product_id, expected_quantity, expected_weight_kg, unit_price`,
      [
        id,
        productIds,
        items.map((i) => i.expectedQuantity),
        items.map((i) => i.expectedWeightKg ?? null),
        items.map((i) => i.unitPrice ?? null),
      ]
    );

    await logAudit(client, {
      entityType: 'purchase_order',
      entityId:   id,
      action:     'updated',
      actorId:    userId,
      before,
      after:      { ...purchaseOrder, items: lines },
    });

    await client.query('COMMIT');

    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      ok: true,
      purchaseOrder: {
        ...purchaseOrder,
        supplier_name: supplier.name,
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

// ── Delete (pending only, never received against) ────────────────
// Hard delete, unlike every other entity in this codebase (suppliers,
// products, beneficiaries all archive instead). That convention exists
// because those rows accumulate real history — past orders, past
// deliveries, past collections — that has to survive the row being
// taken out of pickers. A 'pending' purchase order has none of that:
// no supplier has seen it (BR-07B's lifecycle starts at 'approved'),
// and the has_deliveries check below confirms nothing has been
// received against it either. There is nothing here a soft delete
// would be protecting.
const deletePurchaseOrder = async (id, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      `SELECT id, status FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const existing = existingRows[0] ?? null;
    if (!existing) { await client.query('ROLLBACK'); return { ok: false, code: 'not_found' }; }
    if (existing.status !== 'pending') {
      await client.query('ROLLBACK');
      return { ok: false, code: 'not_deletable', status: existing.status };
    }

    // Belt and braces alongside the status check above: a delivery
    // recorded against this PO would also have moved its status off
    // 'pending' (delivery.repository.js's createDelivery updates PO
    // status on receipt), so this should never fire in practice — but
    // it is the one fact that actually matters, and checking it
    // directly costs one query against trusting a second-hand signal.
    const { rows: deliveries } = await client.query(
      `SELECT 1 FROM delivery_notes WHERE purchase_order_id = $1 LIMIT 1`,
      [id]
    );
    if (deliveries.length) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'has_deliveries' };
    }

    const { rows: beforeRows } = await client.query(
      `SELECT ${PO_COLUMNS.replace(/po\./g, '')} FROM purchase_orders WHERE id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM quickbooks_object_map WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [id]
    );
    await client.query(`DELETE FROM purchase_order_items WHERE purchase_order_id = $1`, [id]);
    await client.query(`DELETE FROM purchase_orders WHERE id = $1`, [id]);

    await logAudit(client, {
      entityType: 'purchase_order',
      entityId:   id,
      action:     'deleted',
      actorId:    actorId ?? null,
      before:     beforeRows[0] ?? null,
      after:      null,
    });

    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Finance email outcome ────────────────────────────────────
// Written only after the send attempt (success or failure) has
// resolved — never speculatively before — so this column can never
// claim 'sent' for an email that actually failed.
const recordFinanceEmailAttempt = async (id, { status, error, attemptedAt }) => {
  await pool.query(
    `UPDATE purchase_orders
        SET finance_email_status = $2,
            finance_email_error = $3,
            finance_email_attempted_at = $4
      WHERE id = $1`,
    [id, status, error, attemptedAt]
  );
};

export default {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  updatePurchaseOrder,
  deletePurchaseOrder,
  setQuickbooksReference,
  previewQuickbooksLinks,
  applyQuickbooksLinks,
  recordFinanceEmailAttempt,
};
