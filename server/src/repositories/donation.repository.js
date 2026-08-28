// ─────────────────────────────────────────────────────────────
// server/src/repositories/donation.repository.js
//
// All SQL for donation intake.
// No business logic here — categories, the Section 18A evaluation and
// the proportional split all arrive already decided from
// donation.service.js.
//
// Written against the LIVE schema, not schema.sql (which is missing
// roughly a dozen tables the code queries). Live column names are
// used throughout: estimated_value_zar, description, received_at.
//
// Every stock change goes through stockModel.adjustStock with this
// file's client, so a donation and the stock movement it caused
// commit or roll back together.
// ─────────────────────────────────────────────────────────────
import pool       from '../config/db.js';
import stockModel from './stock.repository.js';

// ── Audit trail ───────────────────────────────────────────────
// Writes to the shared audit_log rather than a donation-specific
// table. audit_log already carries entity_type / entity_id / action /
// actor_id / reason / before_data / after_data, which is exactly the
// shape a BR-10 reclassification override needs. A second, parallel
// trail would mean two places to look when reconstructing what
// happened to a record.
//
// Takes the caller's client so the entry is part of the same
// transaction — an audit row that survives a rolled-back donation
// would describe something that never happened.
const logAudit = async (client, { entityId, action, actorId, reason = null,
                                  before = null, after = null }) => {
  await client.query(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor_id, reason, before_data, after_data)
     VALUES ('donation', $1, $2, $3, $4, $5, $6)`,
    [entityId, action, actorId, reason, before, after]
  );
};

// ── Section 18A threshold ─────────────────────────────────────
// Read from donation_settings rather than hard-coded, because it is a
// Ladles of Love policy figure that finance will change without a
// deploy. Returns null when the settings row is missing, and the
// service treats that as "cannot evaluate" rather than "qualifies".
const getSection18AThreshold = async () => {
  const result = await pool.query(
    `SELECT section18a_threshold_value FROM donation_settings WHERE id = 1`
  );
  if (!result.rows[0]) return null;
  return Number(result.rows[0].section18a_threshold_value);
};

// ── Active ECDs with their child counts ───────────────────────
// Input to the add-on food proportional split (BR-10). Only centres
// that are active AND approved are eligible, matching the test
// picking.repository applies before generating a slip — an unapproved
// centre must not receive a share.
//
// child_count is NULLABLE in the live schema, so the NULL guard is
// load-bearing rather than decoration: a centre with an unrecorded
// roll would otherwise contribute NULL to the total and poison the
// whole split.
const getEligibleEcdCentres = async () => {
  const result = await pool.query(
    `SELECT id, name, child_count
     FROM ecd_centres
     WHERE is_active = TRUE
       AND approved_at IS NOT NULL
       AND child_count IS NOT NULL
       AND child_count > 0
     ORDER BY id ASC`
  );
  return result.rows.map((r) => ({
    id:         r.id,
    name:       r.name,
    childCount: Number(r.child_count),
  }));
};

// ── Programme lookup ──────────────────────────────────────────
// donations.programme_id is a real FK, so the service resolves a
// programme code (NOC / FTS / LOVE_ACTIVISM) to an id rather than
// trusting an id from the request body.
const getProgrammeByCode = async (code) => {
  const result = await pool.query(
    `SELECT id, code, name FROM programmes WHERE code = $1 AND is_active = TRUE`,
    [code]
  );
  return result.rows[0] || null;
};

// ── Idempotency lookup ────────────────────────────────────────
// Called before a write. A retried submit from the gate must return
// the original donation, not create a second one.
const findByIdempotencyKey = async (key) => {
  const result = await pool.query(
    `SELECT id FROM donations WHERE idempotency_key = $1`,
    [key]
  );
  return result.rows[0] || null;
};

// ── Create a donation ─────────────────────────────────────────
// items arrive from the service already classified, with a
// routingStatus decided and, for add-on food, an allocations array
// attached. This function does not decide anything — it writes.
//
// Only lines whose routingStatus is 'allocated' AND which carry a
// productId move stock. Everything else is recorded and left alone,
// which is what keeps a donation of unknown goods from failing.
const createDonation = async ({
  category,
  programmeId,
  estimatedValueZar,
  donorName,
  donorContact,
  donorTaxReference,
  donorConsentGiven,
  notes,
  idempotencyKey,
  section18aStatus,
  section18aQualifying,
  receivedBy,
  items,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const donationResult = await client.query(
      `INSERT INTO donations
         (category, programme_id, estimated_value_zar, donor_name, donor_contact,
          donor_tax_reference, donor_consent_given, notes, idempotency_key,
          section_18a_status, section_18a_qualifying, received_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        category,
        programmeId || null,
        estimatedValueZar,
        donorName || null,
        donorContact || null,
        donorTaxReference || null,
        donorConsentGiven === true,
        notes || null,
        idempotencyKey || null,
        section18aStatus,
        section18aQualifying === true,
        receivedBy,
      ]
    );

    // ON CONFLICT DO NOTHING returns no row when the key already
    // exists. That is the retried submit: nothing was written, so roll
    // back and let the service answer with the original record.
    // Checked here rather than relying on findByIdempotencyKey alone,
    // because two taps can race past that read before either writes.
    //
    // The WHERE clause above is required, not optional: the unique
    // index on idempotency_key is PARTIAL (WHERE idempotency_key IS
    // NOT NULL), and Postgres will not infer a partial index as the
    // conflict target unless the ON CONFLICT repeats its predicate.
    // Without it every insert fails with 42P10.
    if (!donationResult.rows[0]) {
      await client.query('ROLLBACK');
      return { duplicate: true };
    }

    const donationId = donationResult.rows[0].id;
    const warnings   = [];

    // adjustStock's contract: callers touching multiple products must
    // lock them in product_id order or they deadlock against another
    // transaction doing the same (see delivery.repository.createDelivery
    // and picking.repository.completeSlip). Lines with no product sort
    // last — they take no lock at all.
    const ordered = [...items].sort((a, b) => (a.productId ?? Infinity) - (b.productId ?? Infinity));

    for (const item of ordered) {
      const itemResult = await client.query(
        `INSERT INTO donation_items
           (donation_id, product_id, description, quantity, unit,
            estimated_value_zar, location_id, routing_status,
            routed_category, routing_outcome, routed_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          donationId,
          item.productId ?? null,
          item.description,
          item.quantity,
          item.unit,
          item.estimatedValueZar ?? null,
          item.locationId ?? null,
          item.routingStatus,
          item.routedCategory ?? null,
          item.routingOutcome ?? null,
          item.routedSource ?? null,
        ]
      );

      const donationItemId = itemResult.rows[0].id;

      // ── Stock-bearing line ──────────────────────────────────
      if (item.routingStatus === 'allocated' && item.productId) {
        const res = await stockModel.adjustStock(client, {
          productId:     item.productId,
          quantityDelta: item.quantity,
          unit:          item.unit,
          movementType:  'donated',
          referenceType: 'donation',
          referenceId:   donationId,
          performedBy:   receivedBy,
        });

        if (res.isUnitMismatch) {
          warnings.push({
            donationItemId,
            productId: item.productId,
            message: `Donated unit "${item.unit}" differs from the unit already on record for this product; stock was added in the recorded unit.`,
          });
        }
      }

      // ── Add-on food allocation plan ─────────────────────────
      // Rows here are a plan for dispatch, not a stock movement.
      // Same partial-index rule as the donations insert above: the
      // unique index on (donation_item_id, ecd_id) is partial (WHERE
      // ecd_id IS NOT NULL), so the predicate has to be repeated here
      // or Postgres cannot infer the conflict target.
      for (const alloc of item.allocations || []) {
        await client.query(
          `INSERT INTO donation_allocations
             (donation_item_id, beneficiary_kind, ecd_id, child_count, allocated_quantity, unit)
           VALUES ($1, 'ecd', $2, $3, $4, $5)
           ON CONFLICT (donation_item_id, ecd_id) WHERE ecd_id IS NOT NULL DO NOTHING`,
          [donationItemId, alloc.ecdId, alloc.childCount, alloc.allocatedQuantity, item.unit]
        );
      }
    }

    await logAudit(client, {
      entityId: donationId,
      action:   'donation_received',
      actorId:  receivedBy,
      after: {
        category,
        programme_id:        programmeId || null,
        estimated_value_zar: estimatedValueZar,
        item_count:          items.length,
        section_18a_status:  section18aStatus,
        unmatched_count:     items.filter((i) => i.routingStatus === 'unmatched').length,
      },
    });

    await client.query('COMMIT');
    return { donationId, warnings };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── One donation with its lines and allocations ───────────────
const getDonationById = async (id) => {
  const donationResult = await pool.query(
    `SELECT d.*, u.first_name AS received_by_name,
            p.code AS programme_code, p.name AS programme_name
     FROM donations d
     LEFT JOIN users u      ON u.id = d.received_by
     LEFT JOIN programmes p ON p.id = d.programme_id
     WHERE d.id = $1`,
    [id]
  );

  // Returning null rather than an object — spreading an undefined row
  // produces a truthy {} and the service's not-found check never fires
  // (the bug fixed in delivery.repository.getDeliveryById).
  if (!donationResult.rows[0]) return null;

  const itemsResult = await pool.query(
    `SELECT di.*, pr.name AS product_name, pr.stock_keeping_unit AS sku,
            sl.name AS location_name
     FROM donation_items di
     LEFT JOIN products pr          ON pr.id = di.product_id
     LEFT JOIN storage_locations sl ON sl.id = di.location_id
     WHERE di.donation_id = $1
     ORDER BY di.id ASC`,
    [id]
  );

  const allocationsResult = await pool.query(
    `SELECT da.*, e.name AS ecd_name
     FROM donation_allocations da
     JOIN donation_items di  ON di.id = da.donation_item_id
     LEFT JOIN ecd_centres e ON e.id = da.ecd_id
     WHERE di.donation_id = $1
     ORDER BY da.donation_item_id ASC, e.name ASC`,
    [id]
  );

  const byItem = new Map();
  for (const row of allocationsResult.rows) {
    if (!byItem.has(row.donation_item_id)) byItem.set(row.donation_item_id, []);
    byItem.get(row.donation_item_id).push(row);
  }

  return {
    ...donationResult.rows[0],
    items: itemsResult.rows.map((row) => ({
      ...row,
      allocations: byItem.get(row.id) || [],
    })),
  };
};

// ── List donations by date range ──────────────────────────────
// range: 'today' | 'week' | 'month' | 'all' — same vocabulary as
// delivery.repository.getDeliveries so the two receiving screens
// filter identically.
//
// Filters on received_at (timestamptz); the live table has no
// separate intake_date column. date_trunc('day', NOW()) rather than
// CURRENT_DATE because received_at carries a time.
const listDonations = async (range = 'all') => {
  let dateFilter = '';
  if (range === 'today')      dateFilter = `AND d.received_at >= date_trunc('day', NOW())`;
  else if (range === 'week')  dateFilter = `AND d.received_at >= NOW() - INTERVAL '7 days'`;
  else if (range === 'month') dateFilter = `AND d.received_at >= NOW() - INTERVAL '30 days'`;

  const result = await pool.query(
    `SELECT
       d.id, d.category, d.estimated_value_zar, d.donor_name, d.received_at,
       d.section_18a_status, d.section_18a_qualifying, d.created_at,
       u.first_name AS received_by_name,
       p.code       AS programme_code,
       COUNT(di.id)                                                AS item_count,
       COUNT(di.id) FILTER (WHERE di.routing_status = 'unmatched') AS unmatched_count
     FROM donations d
     LEFT JOIN users u           ON u.id = d.received_by
     LEFT JOIN programmes p      ON p.id = d.programme_id
     LEFT JOIN donation_items di ON di.donation_id = d.id
     WHERE 1=1 ${dateFilter}
     GROUP BY d.id, u.first_name, p.code
     ORDER BY d.received_at DESC`
  );
  return result.rows;
};

// ── The manager's unmatched-item queue ────────────────────────
// Lines accepted at the gate with no product code. Recording them is
// what let the donation through; this is where they get fixed.
const listUnmatchedItems = async () => {
  const result = await pool.query(
    `SELECT
       di.id, di.donation_id, di.description, di.quantity, di.unit, di.location_id,
       d.category, d.received_at, d.donor_name
     FROM donation_items di
     JOIN donations d ON d.id = di.donation_id
     WHERE di.routing_status = 'unmatched'
     ORDER BY d.received_at ASC, di.id ASC`
  );
  return result.rows;
};

const getLocationIdForArea = async (area) => {
  if (!area) return null;
  const result = await pool.query(
    `SELECT id
     FROM storage_locations
     WHERE area = $1 AND is_active = true
     ORDER BY id ASC
     LIMIT 1`,
    [area]
  );
  return result.rows[0]?.id ?? null;
};

// ── Resolve one unmatched line ────────────────────────────────
// A manager attaches the product a gate line could not be matched to.
// This is the deferred half of intake: the stock movement that did not
// happen at the gate happens now, in one transaction with the status
// change, so a line can never read 'allocated' without a matching
// stock_movements row.
const resolveUnmatchedItem = async ({ donationItemId, productId, unit, locationId, resolvedBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE on the item, not just a read: two managers working
    // the queue at once would otherwise both pass the 'unmatched'
    // check and both move stock for the same donated goods.
    const itemResult = await client.query(
      `SELECT di.id, di.donation_id, di.quantity, di.unit, di.routing_status,
              di.location_id, d.category
       FROM donation_items di
       JOIN donations d ON d.id = di.donation_id
       WHERE di.id = $1
       FOR UPDATE OF di`,
      [donationItemId]
    );

    const item = itemResult.rows[0];
    if (!item) { await client.query('ROLLBACK'); return { itemNotFound: true }; }
    if (item.routing_status !== 'unmatched') {
      await client.query('ROLLBACK');
      return { notUnmatched: true, currentStatus: item.routing_status };
    }

    const productCheck = await client.query(
      `SELECT id FROM products WHERE id = $1 AND is_active = TRUE`,
      [productId]
    );
    if (!productCheck.rows[0]) { await client.query('ROLLBACK'); return { productNotFound: true }; }

    // Only recipe food goes into the ECD balance. An unmatched line on
    // a soup-kitchen or non-food donation still gets its product
    // attached — worth having for reporting — but attaching a code
    // does not turn it into ECD stock.
    const movesStock   = item.category === 'recipe_food';
    const newStatus    = movesStock ? 'allocated'
                       : item.category === 'non_recipe_food' ? 'awaiting_programme_stock'
                       : 'not_stock_bearing';
    const resolvedUnit = unit || item.unit;
    let   stockOutcome = null;

    if (movesStock) {
      stockOutcome = await stockModel.adjustStock(client, {
        productId,
        quantityDelta: Number(item.quantity),
        unit:          resolvedUnit,
        movementType:  'donated',
        referenceType: 'donation',
        referenceId:   item.donation_id,
        reason:        'Unmatched donation line resolved',
        performedBy:   resolvedBy,
      });
    }

    await client.query(
      `UPDATE donation_items
       SET product_id = $1, unit = $2, location_id = COALESCE($3, location_id),
           routing_status = $4, resolved_by = $5, resolved_at = NOW()
       WHERE id = $6`,
      [productId, resolvedUnit, locationId ?? null, newStatus, resolvedBy, donationItemId]
    );

    await logAudit(client, {
      entityId: item.donation_id,
      action:   'donation_item_resolved',
      actorId:  resolvedBy,
      before:   { donation_item_id: donationItemId, product_id: null, routing_status: 'unmatched' },
      after:    { donation_item_id: donationItemId, product_id: productId,
                  routing_status: newStatus, moved_stock: movesStock },
    });

    await client.query('COMMIT');
    return { resolved: true, movedStock: movesStock, stockOutcome };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Reclassify a donation (BR-10 manager override) ────────────
// Deliberately does NOT re-run the routing. Reversing stock that has
// already moved, cancelling an allocation plan dispatch may have acted
// on, and re-deriving a split from child counts that have since
// changed are three separate problems, and doing them silently inside
// a category change is how a balance ends up wrong with no trace. The
// category and the override are recorded; correcting the stock is a
// separate, visible manual adjustment.
const reclassifyDonation = async ({ donationId, category, reason, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, category FROM donations WHERE id = $1 FOR UPDATE`,
      [donationId]
    );
    if (!existing.rows[0]) { await client.query('ROLLBACK'); return { notFound: true }; }

    const previous = existing.rows[0].category;
    if (previous === category) { await client.query('ROLLBACK'); return { unchanged: true }; }

    await client.query(
      `UPDATE donations SET category = $1 WHERE id = $2`,
      [category, donationId]
    );

    // before_data / after_data is exactly what audit_log is for — this
    // is the BR-10 override and it has to be reconstructable later.
    await logAudit(client, {
      entityId: donationId,
      action:   'donation_reclassified',
      actorId,
      reason,
      before:   { category: previous },
      after:    { category },
    });

    await client.query('COMMIT');
    return { reclassified: true, from: previous, to: category };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Section 18A work queue ────────────────────────────────────
// Two statuses, deliberately together: 'queued' is ready to send to
// QuickBooks, 'qualifying_pending_donor' is money that qualified but
// has no donor to issue to. Finance needs both, because the second is
// the recoverable case — someone can still phone the donor back.
const listSection18AQueue = async () => {
  const result = await pool.query(
    `SELECT id, estimated_value_zar, donor_name, donor_contact, donor_tax_reference,
            donor_consent_given, received_at, section_18a_status,
            section_18a_certificate_ref, section_18a_issued_at
     FROM donations
     WHERE section_18a_status IN ('qualifying_pending_donor', 'queued')
     ORDER BY received_at ASC, id ASC`
  );
  return result.rows;
};

// ── Audit trail for one donation ──────────────────────────────
const getDonationEvents = async (donationId) => {
  const result = await pool.query(
    `SELECT a.*, u.first_name AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.entity_type = 'donation' AND a.entity_id = $1
     ORDER BY a.created_at ASC`,
    [donationId]
  );
  return result.rows;
};

export default {
  getSection18AThreshold,
  getEligibleEcdCentres,
  getProgrammeByCode,
  findByIdempotencyKey,
  createDonation,
  getDonationById,
  listDonations,
  listUnmatchedItems,
  getLocationIdForArea,
  resolveUnmatchedItem,
  reclassifyDonation,
  listSection18AQueue,
  getDonationEvents,
};