// ─────────────────────────────────────────────────────────────
// server/src/repositories/delivery.repository.js
//
// All SQL for the procurement dashboard.
// No business logic here — only database queries.
//
// Delivery lines arrive already validated and PO-verified from
// delivery.service.js. Nothing in this file re-derives quantities.
//
// WHAT THIS FILE OWNS THAT THE SERVICE CANNOT
// Three checks live inside createDelivery's transaction rather than
// in the service, because a check made before BEGIN is a check
// another request can overtake:
//
//   - the purchase order exists
//   - it belongs to the supplier the note is being written against
//   - it is still open ('approved')
//
// The supplier check is the one that was missing entirely.
// supplierId came off the request body and went straight into
// delivery_notes.supplier_id with nothing comparing it to
// purchase_orders.supplier_id, so a delivery note could name one
// supplier while receiving against another supplier's order — and
// every downstream report that joins the two would disagree with
// itself.
//
// The status check closes the other half: a PO already marked
// 'completed' could be received against again, adding its stock a
// second time with a perfectly ordinary-looking note to show for it.
// ─────────────────────────────────────────────────────────────
import pool       from "../config/db.js";
import stockModel from "./stock.repository.js";
import { DELIVERY_SORTS, buildOrderBy } from "../constants/receiptSort.js";
import {
  isOpenPurchaseOrder,
  OPEN_PO_STATUSES,
  PO_STATUS_FULLY_RECEIVED,
  PO_STATUS_PARTIALLY_RECEIVED,   // eslint-disable-line no-unused-vars -- see createDelivery
} from "../constants/purchaseOrderStatus.js";

// ── The goods-in archive ──────────────────────────────────────
// Every delivery note ever recorded, filterable and paged.
//
// WHY THIS GREW FROM range='today|week|month|all'
// A named range answers "what came in recently". The archive answers "find me
// the note for the short delivery from Meridian in July", which needs an
// explicit from/to, a supplier, and a way to jump to the flagged ones. The
// four named ranges are still honoured by the service, which converts them to
// concrete dates before calling this.
//
// CURRENT_DATE IS NOT USED HERE. Render runs UTC and the warehouse is SAST,
// so between 00:00 and 02:00 CURRENT_DATE is still yesterday and "today"
// silently loses a day's notes. The service resolves calendar dates in SAST
// and passes them in — the same rule dispatch.repository's gateToday follows.
//
// LEFT JOIN suppliers, not JOIN. getDeliveryById already used LEFT, so a note
// whose supplier row went missing vanished from the list while still opening
// by id. BR-27's retention principle says a historical record survives the
// removal of the thing it refers to.
//
// COUNT(*) OVER () rides along on the same scan rather than a second query.
// It is identical on every row; the service lifts it off row zero.
const getDeliveries = async ({
  from = null,
  to = null,
  supplierId = null,
  status = null,
  search = null,
  sort = 'delivery_date',
  dir = 'desc',
  limit = 25,
  offset = 0,
} = {}) => {
  // From the whitelist, never from the caller's string. See receiptSort.js.
  const orderBy = buildOrderBy(DELIVERY_SORTS, sort, dir, 'delivery_date', 'dn.id');
  const result = await pool.query(
    `SELECT
       dn.id,
       dn.delivery_date,
       dn.status,
       dn.created_at,
       dn.driver_name,
       dn.purchase_order_id,
       s.id                  AS supplier_id,
       s.name                AS supplier_name,
       u.first_name          AS received_by_name,
       po.status     AS po_status,
       po.po_number,
       po.status             AS po_status,
       COALESCE(d.discrepancy_count, 0)        AS discrepancy_count,
       COALESCE(d.discrepancy_count, 0) > 0    AS has_discrepancies,
       COALESCE(d.unresolved_count, 0)         AS unresolved_discrepancy_count,
       COALESCE(i.line_count, 0)               AS line_count,
       COUNT(*) OVER ()                        AS total_count
     FROM delivery_notes dn
     LEFT JOIN suppliers s       ON s.id  = dn.supplier_id
     LEFT JOIN users u           ON u.id  = dn.received_by
     LEFT JOIN purchase_orders po ON po.id = dn.purchase_order_id
     -- Aggregated in subqueries rather than a GROUP BY over the join, so the
     -- window function above counts NOTES and not note-item rows.
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE dni.discrepancy_quantity <> 0)                                   AS discrepancy_count,
         COUNT(*) FILTER (WHERE dni.discrepancy_quantity <> 0 AND dni.discrepancy_resolved = false) AS unresolved_count
       FROM delivery_note_items dni
       WHERE dni.delivery_note_id = dn.id
     ) d ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS line_count
       FROM delivery_note_items dni2
       WHERE dni2.delivery_note_id = dn.id
     ) i ON TRUE
     WHERE ($1::date IS NULL OR dn.delivery_date >= $1::date)
       AND ($2::date IS NULL OR dn.delivery_date <= $2::date)
       AND ($3::int  IS NULL OR dn.supplier_id   = $3::int)
       AND ($4::text IS NULL OR dn.status        = $4::text)
       -- Free text across the two things someone actually has in their hand:
       -- a PO number off a printed order, or the note's own record number.
       -- dn.id::text so "11" matches note 11 without a separate numeric field.
       AND ($5::text IS NULL
            OR po.po_number ILIKE '%' || $5::text || '%'
            OR dn.id::text  ILIKE '%' || $5::text || '%'
            OR s.name       ILIKE '%' || $5::text || '%')
     ORDER BY ${orderBy}
     LIMIT $6 OFFSET $7`,
    [from, to, supplierId, status, search, limit, offset],
  );

  return result.rows;
};

// ── Get a single delivery with all its line items ─────────────
// Line items come from delivery_note_items — the record of what
// actually arrived. Reading them off the purchase order instead
// would reprint a short delivery as if it were complete.
const getDeliveryById = async (id) => {
  const deliveryResult = await pool.query(
    `SELECT
       dn.id,
       dn.delivery_date,
       dn.status,
       dn.created_at,
       dn.signature,
       dn.purchase_order_id,
       s.name           AS supplier_name,
       s.address        AS supplier_address,
       s.contact_phone  AS supplier_phone,
       u.first_name     AS received_by_name
     FROM delivery_notes dn
     LEFT JOIN suppliers s ON s.id = dn.supplier_id
     LEFT JOIN users u ON u.id = dn.received_by
     WHERE dn.id = $1`,
    [id],
  );

  // Return null when there's no such delivery. Spreading an undefined
  // row produced a truthy {} instead, so the service's not-found check
  // never fired and the controller's 404 branch was unreachable.
  if (!deliveryResult.rows[0]) return null;

  const purchaseOrderId = deliveryResult.rows[0].purchase_order_id;

  const itemsResult = await pool.query(
    `SELECT
       dni.id                 AS delivery_note_item_id,
       dni.product_id,
       dni.purchase_order_item_id,
       dni.expected_quantity,
       dni.expected_weight_kg,
       dni.received_quantity,
       dni.received_weight_kg,
       dni.unit,
       dni.discrepancy_quantity,
       dni.discrepancy_reason,
       dni.discrepancy_resolved,
       p.name                 AS product_name,
       p.stock_keeping_unit   AS sku
     FROM delivery_note_items dni
     JOIN products p ON p.id = dni.product_id
     WHERE dni.delivery_note_id = $1
     ORDER BY p.name ASC`,
    [id],
  );

  // Notes recorded before delivery_note_items was wired up have no
  // lines of their own. Fall back to the purchase order so the note
  // still prints, and mark it so the PDF can say the quantities are
  // the ordered ones, not a record of what actually arrived.
  let items = itemsResult.rows;
  let itemsFromPurchaseOrder = false;

  if (items.length === 0) {
    const fallback = await pool.query(
      `SELECT
         poi.id                 AS purchase_order_item_id,
         poi.product_id,
         poi.expected_quantity,
         poi.expected_weight_kg,
         poi.expected_quantity  AS received_quantity,
         NULL::numeric          AS received_weight_kg,
         p.default_unit         AS unit,
         NULL::numeric          AS discrepancy_quantity,
         NULL::text             AS discrepancy_reason,
         FALSE                  AS discrepancy_resolved,
         p.name                 AS product_name,
         p.stock_keeping_unit   AS sku
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
       WHERE poi.purchase_order_id = $1
       ORDER BY p.name ASC`,
      [purchaseOrderId],
    );
    items = fallback.rows;
    itemsFromPurchaseOrder = items.length > 0;
  }

  const poResult = await pool.query(
    `SELECT
       po.id,
       po.status,
       (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.purchase_order_id = po.id) AS delivery_count
     FROM purchase_orders po
     WHERE po.id = $1`,
    [purchaseOrderId],
  );

  return {
    ...deliveryResult.rows[0],
    items,
    // True when the lines above came from the purchase order rather
    // than from this delivery — the PDF must not present them as a
    // record of what physically arrived.
    items_from_purchase_order: itemsFromPurchaseOrder,
    has_discrepancies: items.some((i) => Number(i.discrepancy_quantity) !== 0),
    discrepancy_count: items.filter((i) => Number(i.discrepancy_quantity) !== 0).length,
    po_status:         poResult.rows[0]?.status || null,
    po_id:             poResult.rows[0]?.id || null,
    po_delivery_count: poResult.rows[0]?.delivery_count || 0,
  };
};

// ── Idempotency lookup ────────────────────────────────────────
// Called before a write. Receiving happens on a tablet at a loading
// bay, and a retried submit must return the original note rather than
// receive the same pallet twice. Mirrors donation.repository's
// findByIdempotencyKey exactly — same problem, same shape.
const findByIdempotencyKey = async (key) => {
  const result = await pool.query(
    `SELECT id FROM delivery_notes WHERE idempotency_key = $1`,
    [key],
  );
  return result.rows[0] || null;
};

// ── One purchase order header ─────────────────────────────────
// Read-only, for the service's early validation. The authoritative
// check is the FOR UPDATE inside createDelivery — this exists so the
// common failure comes back as a clean 404/409 without opening a
// transaction, not to be relied on for correctness.
const getPurchaseOrder = async (id) => {
  const result = await pool.query(
    `SELECT id, supplier_id, status FROM purchase_orders WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
};

// ── Create a new delivery note ────────────────────────────────
// Writes the note, one delivery_note_items row per line, and one
// stock movement per line that actually brought stock in.
//
// lineItems arrive validated and matched against the purchase order
// by the service — this function does not re-derive quantities.
// Each line carries both receivedQuantity (what physically arrived,
// which feeds the generated discrepancy_quantity column) and
// acceptedQuantity (what goes into stock). They differ only when a
// surplus was turned away.
const createDelivery = async ({
  supplierId,
  deliveryDate,
  receivedBy,
  purchaseOrderId,
  signatureData,
  poCompleted,
  lineItems,
  hasDiscrepancy,
  idempotencyKey = null,
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Replay check, before anything is locked or written ──
    // Same ordering as dispatch.repository.collect: cheapest check
    // first, and a retry must not take a lock it does not need.
    if (idempotencyKey) {
      const replay = await client.query(
        `SELECT id FROM delivery_notes WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      if (replay.rows[0]) {
        await client.query("COMMIT");
        return { duplicate: true, deliveryNoteId: replay.rows[0].id };
      }
    }

    // ── The purchase order, locked ─────────────────────────────
    // FOR UPDATE because the two checks below are read-then-write:
    // without it, two tablets submitting the same delivery at the
    // same moment both see 'approved' and both receive the stock.
    const poResult = await client.query(
      `SELECT id, supplier_id, status FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [purchaseOrderId],
    );
    const purchaseOrder = poResult.rows[0];

    if (!purchaseOrder) {
      await client.query("ROLLBACK");
      return { purchaseOrderNotFound: true };
    }

    // The note and the order must agree about who delivered. This is
    // not a formality: delivery_notes.supplier_id is what every
    // supplier-performance report groups by, and purchase_orders
    // .supplier_id is what procurement reconciles against.
    if (Number(purchaseOrder.supplier_id) !== Number(supplierId)) {
      await client.query("ROLLBACK");
      return {
        supplierMismatch:   true,
        expectedSupplierId: purchaseOrder.supplier_id,
      };
    }

    // Only an open order can be received against. A 'completed' one
    // has already had its stock taken in; receiving against it again
    // doubles the balance.
    // BR-07B vocabulary. This used to demand status === 'approved', a value
    // migration 002 stopped producing — while listOpenPurchaseOrders
    // below offered pending/in_transit/partially_received. The two disagreed,
    // so every order the dropdown offered was rejected here and the only
    // orders that passed were ones the dropdown never showed.
    if (!isOpenPurchaseOrder(purchaseOrder.status)) {
      await client.query("ROLLBACK");
      return { purchaseOrderNotOpen: true, status: purchaseOrder.status };
    }

    // status and created_at both have defaults — listing them here is
    // what produced the original "more expressions than target columns".
    //
    // ON CONFLICT covers the race the read above cannot: two taps can
    // both get past it before either writes. The WHERE clause is
    // REQUIRED, not decorative — the unique index on idempotency_key
    // is partial (WHERE idempotency_key IS NOT NULL) and Postgres
    // will not infer a partial index as a conflict target unless the
    // predicate is repeated here. Without it every insert fails with
    // 42P10. See database/migrations/2026-08-19_delivery_idempotency.sql.
    const noteResult = await client.query(
      `INSERT INTO delivery_notes
         (supplier_id, delivery_date, received_by, purchase_order_id, signature, status,
          idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        supplierId,
        deliveryDate,
        receivedBy,
        purchaseOrderId,
        signatureData || null,
        hasDiscrepancy ? "flagged" : "recorded",
        idempotencyKey,
      ],
    );

    // No row means the key already existed — the other tap won.
    // Nothing was written, so roll back and let the service answer
    // with the original note.
    if (!noteResult.rows[0]) {
      await client.query("ROLLBACK");
      return { duplicate: true };
    }

    const deliveryNoteId = noteResult.rows[0].id;

    // adjustStock's contract: callers touching multiple products must
    // lock them in product_id order or they deadlock against other
    // transactions doing the same (see picking.repository completeSlip).
    const ordered = [...lineItems].sort((a, b) => a.productId - b.productId);
    const warnings = [];

    for (const line of ordered) {
      // discrepancy_quantity and discrepancy_weight_kg are GENERATED
      // ALWAYS columns — Postgres computes them, they cannot be written.
      await client.query(
        `INSERT INTO delivery_note_items
           (delivery_note_id, product_id, purchase_order_item_id,
            expected_quantity, expected_weight_kg,
            received_quantity, unit, discrepancy_reason,
            storage_area, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          deliveryNoteId,
          line.productId,
          line.purchaseOrderItemId,
          line.expectedQuantity,
          line.expectedWeightKg,
          line.receivedQuantity,
          line.unit,
          line.discrepancyReason,
          line.storageArea,   // BR-07 — migration 018
          line.expiryDate,    // BR-06 — null for anything not perishable
        ],
      );

      // A fully-rejected or zero-received line still gets a note row —
      // the record of what didn't arrive matters — but moves no stock.
      if (line.acceptedQuantity > 0) {
        const res = await stockModel.adjustStock(client, {
          productId:     line.productId,
          quantityDelta: line.acceptedQuantity,
          unit:          line.unit,
          movementType:  "received",
          referenceType: "delivery_note",
          referenceId:   deliveryNoteId,
          performedBy:   receivedBy,
        });

        if (res.isUnitMismatch) {
          warnings.push({
            productId: line.productId,
            message: `Delivery unit "${line.unit}" differs from the unit already on record for this product; stock was added in the recorded unit.`,
          });
        }
      }
    }

    // 'completed' — the only closed-off value purchase_orders_status_check
    // permits. This used to write 'received', which is not in the
    // constraint, so every fully-received delivery raised 23514 and rolled
    // back the entire receipt: the delivery note, its line items and its
    // stock movements all disappeared along with the status update.
    //
    // OPEN QUESTION FOR HUSSAIN (BR-07B): should a delivery that does NOT
    // close the order set 'partially_received' automatically? Right now the
    // status only moves when the receiver ticks the box, which means a PO
    // that has had three partial deliveries still reads 'pending'. The
    // constant is imported and ready if the answer is yes.
    if (poCompleted) {
      await client.query(
        `UPDATE purchase_orders SET status = $2 WHERE id = $1`,
        [purchaseOrderId, PO_STATUS_FULLY_RECEIVED],
      );
    }

    await client.query("COMMIT");
    return { ...noteResult.rows[0], warnings };
  } catch (err) {
    // ONE rollback. There were two here. In the happy failure case the
    // second is a harmless Postgres warning, but if the first throws —
    // a dead connection, which is exactly when a rollback happens —
    // the second throws on top of it and the original error, the one
    // that says what actually went wrong, is lost.
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ── Suppliers that actually appear in the archive ─────────────
// The filter dropdown should offer the suppliers you have notes FOR, not
// every supplier on file — otherwise most options return nothing. Includes
// deactivated suppliers, because their historical notes are still there.
const getSupplierOptions = async () => {
  const result = await pool.query(
    `SELECT DISTINCT s.id, s.name, s.is_active
     FROM delivery_notes dn
     JOIN suppliers s ON s.id = dn.supplier_id
     ORDER BY s.name ASC`,
  );
  return result.rows;
};

// ── Get all active suppliers ──────────────────────────────────
// The comment said "active" and the SQL said nothing — there was no
// WHERE clause at all, so every deactivated supplier has been showing
// up in the receiving picker. Predates the archive tier; found while
// mapping which queries it had to reach.
const getSuppliers = async () => {
  const result = await pool.query(
    `SELECT id, name, contact_email
     FROM suppliers
     WHERE is_active = true
     ORDER BY name ASC`,
  );
  return result.rows;
};

// ── Get suppliers with at least one order still open ──────────
// For the Form view's supplier picker: no point offering a supplier
// there is nothing to receive from. Reads OPEN_PO_STATUSES, the same
// list listOpenPurchaseOrders below uses, so the two can never
// disagree about what counts as open. It used to hard-code
// status = 'approved', which stopped matching anything the moment
// 'approved' became legacy — the picker silently went near-empty.
// DISTINCT because a supplier can have more than one open order and
// should still only appear once.
const getSuppliersWithOpenOrders = async () => {
  const result = await pool.query(
    `SELECT DISTINCT s.id, s.name, s.contact_email
     FROM suppliers s
     JOIN purchase_orders po ON po.supplier_id = s.id
     WHERE po.status = ANY($1)
       AND s.is_active = true
     ORDER BY s.name ASC`,
    [OPEN_PO_STATUSES],
  );
  return result.rows;
};

// ── Get all active products ───────────────────────────────────
const getProducts = async () => {
  const result = await pool.query(
    `SELECT id, name, stock_keeping_unit AS sku, weight_kg, default_unit
     FROM products
     WHERE is_active = true
     ORDER BY name ASC`,
  );
  return result.rows;
};

// ── Get purchase orders for a supplier ───────────────────────
// Only returns orders still expecting goods — can't receive against
// one already closed off. Reads the same OPEN_PO_STATUSES as
// getSuppliersWithOpenOrders above, so the two agree by construction
// rather than by two people remembering to edit both.
// supplierId is OPTIONAL. Passed, this is the old per-supplier list;
// omitted, it is every open order in the building.
//
// The second shape is what lets the receiving screen be searched by
// order number. A driver arrives with a note that has an order number
// on it and no reliable supplier name, and until now the only way in
// was to guess the supplier first.
//
// supplier_name is selected because the list can now span suppliers,
// and "Order 86" on its own is not enough to pick the right one.
//
// NULLS LAST because an order with no expected date sorted first
// under plain ASC, which put the least specific rows at the top of a
// list people read top-down. The id tiebreak keeps the order stable
// between two calls, which keyset-free client paging depends on.
const listOpenPurchaseOrders = async (supplierId = null) => {
  const result = await pool.query(
    `SELECT
       po.id,
       po.status,
       po.supplier_id,
       s.name AS supplier_name,
       po.expected_delivery_date,
       po.created_at,
       u.first_name AS created_by_name
     FROM purchase_orders po
     LEFT JOIN users u ON u.id = po.created_by
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     WHERE ($1::int IS NULL OR po.supplier_id = $1::int)
       AND po.status = ANY($2)
     ORDER BY po.expected_delivery_date ASC NULLS LAST, po.id ASC`,
    [supplierId ?? null, OPEN_PO_STATUSES],
  );
  return result.rows;
};

// ── Get line items for a specific purchase order ──────────────
// Returns product name, expected quantity and weight so the form can
// auto-populate. default_unit is what the stock ledger is keyed on —
// without it, a product's first movement has no unit to record.
const getPurchaseOrderItems = async (purchaseOrderId) => {
  const result = await pool.query(
    `SELECT
       poi.id                  AS purchase_order_item_id,
       poi.product_id,
       poi.expected_quantity,
       poi.expected_weight_kg,
       poi.unit_price,
       p.name                  AS product_name,
       p.stock_keeping_unit    AS sku,
       p.weight_kg             AS product_weight_kg,
       p.default_unit,
       p.is_perishable
     FROM purchase_order_items poi
     JOIN products p ON p.id = poi.product_id
     WHERE poi.purchase_order_id = $1
     ORDER BY p.name ASC`,
    [purchaseOrderId],
  );
  return result.rows;
};

export default {
  getDeliveries,
  getSupplierOptions,
  getDeliveryById,
  findByIdempotencyKey,
  getPurchaseOrder,
  createDelivery,
  getSuppliers,
  getSuppliersWithOpenOrders,
  getProducts,
  listOpenPurchaseOrders,
  getPurchaseOrderItems,
};