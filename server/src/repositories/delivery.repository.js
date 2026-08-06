// ─────────────────────────────────────────────────────────────
// server/src/models/delivery.model.js
//
// All SQL for the procurement dashboard.
// No business logic here — only database queries.
// ─────────────────────────────────────────────────────────────
import pool       from "../config/db.js";
import stockModel from "./stock.repository.js";

// ── Get all deliveries with optional date range ───────────────
// range: 'today' | 'week' | 'month' | 'all'
const getDeliveries = async (range = "all") => {
  let dateFilter = "";

  if (range === "today") {
    dateFilter = `AND dn.delivery_date = CURRENT_DATE`;
  } else if (range === "week") {
    dateFilter = `AND dn.delivery_date >= CURRENT_DATE - INTERVAL '7 days'`;
  } else if (range === "month") {
    dateFilter = `AND dn.delivery_date >= CURRENT_DATE - INTERVAL '30 days'`;
  }

  const result = await pool.query(
    `SELECT
       dn.id,
       dn.delivery_date,
       dn.status,
       dn.created_at,
       s.name        AS supplier_name,
       u.first_name  AS received_by_name
     FROM delivery_notes dn
     JOIN suppliers s ON s.id = dn.supplier_id
     LEFT JOIN users u ON u.id = dn.received_by
     WHERE 1=1 ${dateFilter}
     ORDER BY dn.created_at DESC`,
  );

  return result.rows;
};

// ── Get a single delivery with all its line items ─────────────
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
       u.first_name     AS received_by_name
     FROM delivery_notes dn
     LEFT JOIN suppliers s ON s.id = dn.supplier_id
     LEFT JOIN users u ON u.id = dn.received_by
     WHERE dn.id = $1`,
    [id],
  );

  // Fetch items from the linked purchase order
  // We use purchase_order_id from the delivery note to get the expected items
  const itemsResult = await pool.query(
    `SELECT
       poi.id                AS purchase_order_item_id,
       poi.expected_quantity,
       poi.expected_weight_kg,
       p.name                AS product_name,
       p.stock_keeping_unit  AS sku
     FROM purchase_order_items poi
     JOIN products p ON p.id = poi.product_id
     WHERE poi.purchase_order_id = (
       SELECT purchase_order_id FROM delivery_notes WHERE id = $1
     )
     ORDER BY p.name ASC`,
    [id],
  );

  // Also fetch the PO status so the PDF can show completion state
  const poResult = await pool.query(
    `SELECT
       po.id,
       po.status,
       (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.purchase_order_id = po.id) AS delivery_count
     FROM purchase_orders po
     WHERE po.id = (SELECT purchase_order_id FROM delivery_notes WHERE id = $1)`,
    [id],
  );

  return {
    ...deliveryResult.rows[0],
    items: itemsResult.rows,
    po_status: poResult.rows[0]?.status || null,
    po_id: poResult.rows[0]?.id || null,
    po_delivery_count: poResult.rows[0]?.delivery_count || 0,
  };
};

// ── Create a new delivery note ────────────────────────────────
// Links the delivery note to the purchase order.
// Items are already known from the PO — no cross-check needed.
// Receives already-validated, PO-verified lines from the service.
const createDelivery = async ({
  supplierId, deliveryDate, receivedBy, purchaseOrderId,
  signatureData, poCompleted, lineItems, hasDiscrepancy,
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const noteResult = await client.query(
      `INSERT INTO delivery_notes
         (supplier_id, delivery_date, received_by, purchase_order_id, signature, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [supplierId, deliveryDate, receivedBy, purchaseOrderId,
       signatureData || null, hasDiscrepancy ? 'flagged' : 'recorded'],
    );
    const deliveryNoteId = noteResult.rows[0].id;

    // adjustStock's contract: callers touching multiple products must
    // lock in product_id order or they deadlock against completeSlip.
    const ordered = [...lineItems].sort((a, b) => a.productId - b.productId);
    const warnings = [];

    for (const line of ordered) {
       await client.query(
        `INSERT INTO delivery_note_items
           (delivery_note_id, product_id, purchase_order_item_id,
            expected_quantity, expected_weight_kg,
            received_quantity, unit, discrepancy_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [deliveryNoteId, line.productId, line.purchaseOrderItemId,
         line.expectedQuantity, line.expectedWeightKg,
         line.receivedQuantity, line.unit, line.discrepancyReason],
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
            message: `Delivery unit "${line.unit}" differs from the unit already on record; stock was added in the recorded unit.`,
          });
        }
      }
    }

    if (poCompleted) {
      await client.query(
        `UPDATE purchase_orders SET status = 'completed' WHERE id = $1`,
        [purchaseOrderId],
      );
    }

    await client.query("COMMIT");
    return { ...noteResult.rows[0], warnings };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};


// ── Get all active suppliers ──────────────────────────────────
const getSuppliers = async () => {
  const result = await pool.query(
    `SELECT id, name, contact_email FROM suppliers ORDER BY name ASC`,
  );
  return result.rows;
};


// ── Get all active products ───────────────────────────────────
const getProducts = async () => {
  const result = await pool.query(
    `SELECT id, name, stock_keeping_unit AS sku, weight_kg
     FROM products
     WHERE is_active = true
     ORDER BY name ASC`,
  );
  return result.rows;
};

// ── Get purchase orders for a supplier ───────────────────────
// Only returns approved POs — can't receive against a pending one
const getPurchaseOrdersBySupplier = async (supplierId) => {
  const result = await pool.query(
    `SELECT
       po.id,
       po.status,
       po.expected_delivery_date,
       po.created_at,
       u.first_name AS created_by_name
     FROM purchase_orders po
     LEFT JOIN users u ON u.id = po.created_by
     WHERE po.supplier_id = $1
       AND po.status = 'approved'
     ORDER BY po.expected_delivery_date ASC`,
    [supplierId],
  );
  return result.rows;
};

// ── Get line items for a specific purchase order ──────────────
// Returns product name, expected quantity and weight so the
// form can auto-populate without the worker typing anything
const getPurchaseOrderItems = async (purchaseOrderId) => {
  const result = await pool.query(
    `SELECT
       poi.id                  AS purchase_order_item_id,
       poi.product_id,
       poi.expected_quantity,
       poi.expected_weight_kg,
       poi.unit_price,
       p.default_unit,
       p.name                  AS product_name,
       p.stock_keeping_unit    AS sku,
       p.weight_kg             AS product_weight_kg,
       p.default_unit
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
  getDeliveryById,
  createDelivery,
  getSuppliers,
  getProducts,
  getPurchaseOrdersBySupplier,
  getPurchaseOrderItems,
};
