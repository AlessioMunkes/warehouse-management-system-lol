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
       d.name        AS driver_name,
       d.license_number AS driver_id_number,
       u.first_name  AS received_by_name
     FROM delivery_notes dn
     JOIN suppliers s ON s.id = dn.supplier_id
     LEFT JOIN drivers d ON d.id = dn.driver_id
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
       d.name           AS driver_name,
       d.license_number AS driver_id_number,
       u.first_name     AS received_by_name
     FROM delivery_notes dn
     LEFT JOIN suppliers s ON s.id = dn.supplier_id
     LEFT JOIN drivers d ON d.id = dn.driver_id
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
const createDelivery = async ({
  supplierId,
  driverId,
  deliveryDate,
  receivedBy,
  purchaseOrderId,
  signatureData,
  poCompleted,
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert the delivery note
    const result = await client.query(
      `INSERT INTO delivery_notes
         (supplier_id, driver_id, delivery_date, received_by, purchase_order_id, signature, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'recorded', NOW())
       RETURNING *`,
      [
        supplierId,
        driverId,
        deliveryDate,
        receivedBy,
        purchaseOrderId,
        signatureData || null,
      ],
    );

    // If the worker checked "PO completed", mark it so it won't appear in future deliveries
    if (poCompleted) {
      await client.query(
        `UPDATE purchase_orders SET status = 'completed' WHERE id = $1`,
        [purchaseOrderId],
      );
    }

    const items = await getPurchaseOrderItems(purchaseOrderId); // reuse existing query
    for (const item of items) {
      await stockModel.adjustStock(client, {
        productId: item.product_id,
        quantityDelta: item.expected_quantity, // swap for an actual-received qty if you add that field later
        movementType: "procurement",
        referenceType: "delivery_note",
        referenceId: result.rows[0].id,
        performedBy: receivedBy,
      });
    }

    await client.query("COMMIT");
    return result.rows[0];
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

// ── Get drivers — optionally filtered by supplier ─────────────
const getDrivers = async (supplierId = null) => {
  if (supplierId) {
    const result = await pool.query(
      `SELECT id, name, license_number, supplier_id
       FROM drivers
       WHERE supplier_id = $1
       ORDER BY name ASC`,
      [supplierId],
    );
    return result.rows;
  }

  const result = await pool.query(
    `SELECT id, name, license_number, supplier_id FROM drivers ORDER BY name ASC`,
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
       p.name                  AS product_name,
       p.stock_keeping_unit    AS sku,
       p.weight_kg             AS product_weight_kg
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
  getDrivers,
  getProducts,
  getPurchaseOrdersBySupplier,
  getPurchaseOrderItems,
};