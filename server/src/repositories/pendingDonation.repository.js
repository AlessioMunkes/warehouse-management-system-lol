import pool from '../config/db.js';

const coerceValue = (value) => {
  if (value === undefined) return null;
  return value;
};

const createPendingDonation = async (data = {}, client = pool) => {
  const payload = data || {};

  const row = {
    donorName: payload.donorName ?? payload.donor_name ?? null,
    donorContact: payload.donorContact ?? payload.donor_contact ?? null,
    donorTaxReference: payload.donorTaxReference ?? payload.donor_tax_reference ?? null,
    donorConsentGiven: payload.donorConsentGiven ?? payload.donor_consent_given ?? null,
    estimatedValueZar: payload.estimatedValueZar ?? payload.estimated_value_zar ?? null,
    donationCategory: payload.donationCategory ?? payload.donation_category ?? null,
    programmeId: payload.programmeId ?? payload.programme_id ?? null,
    notes: payload.notes ?? null,
    section18aStatus: payload.section18aStatus ?? payload.section_18a_status ?? null,
    section18aQualifying: payload.section18aQualifying ?? payload.section_18a_qualifying ?? null,
    draftSnapshot: payload.draftSnapshot ?? payload.draft_snapshot ?? null,
    idempotencyKey: payload.idempotencyKey ?? payload.idempotency_key ?? null,
    createdBy: payload.createdBy ?? payload.created_by ?? null,
  };

  const result = await client.query(
    `INSERT INTO pending_donations (
       donor_name,
       donor_contact,
       donor_tax_reference,
       donor_consent_given,
       estimated_value_zar,
       donation_category,
       programme_id,
       notes,
       section_18a_status,
       section_18a_qualifying,
       draft_snapshot,
       idempotency_key,
       created_by,
       status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft')
     RETURNING *;`,
    [
      row.donorName,
      row.donorContact,
      row.donorTaxReference,
      row.donorConsentGiven,
      row.estimatedValueZar,
      row.donationCategory,
      row.programmeId,
      row.notes,
      row.section18aStatus,
      row.section18aQualifying,
      row.draftSnapshot,
      row.idempotencyKey,
      row.createdBy,
    ]
  );

  return result.rows[0] || null;
};

const createPendingDonationItems = async (pendingDonationId, items = [], client = pool) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const rows = items.map((item, index) => {
    const line = item || {};
    return {
      lineNo: line.lineNo ?? line.line_no ?? index + 1,
      description: line.description ?? '',
      productId: line.productId ?? line.product_id ?? null,
      quantity: line.quantity ?? null,
      unit: line.unit ?? null,
      estimatedValueZar: line.estimatedValueZar ?? line.estimated_value_zar ?? null,
      requestedCategory: line.requestedCategory ?? line.requested_category ?? null,
      status: line.status ?? 'awaiting_resolution',
      flagId: line.flagId ?? line.flag_id ?? null,
      source: line.source ?? null,
      resolvedCategory: line.resolvedCategory ?? line.resolved_category ?? null,
      routingStatus: line.routingStatus ?? line.routing_status ?? null,
      storageAreaHint: line.storageAreaHint ?? line.storage_area_hint ?? null,
    };
  });

  const placeholders = [];
  const params = [];

  rows.forEach((row, rowIndex) => {
    const base = rowIndex * 14;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`
    );

    params.push(
      pendingDonationId,
      row.lineNo,
      row.description,
      row.productId,
      row.quantity,
      row.unit,
      row.estimatedValueZar,
      row.requestedCategory,
      row.resolvedCategory,
      row.routingStatus,
      row.storageAreaHint,
      row.source,
      row.status,
      row.flagId,
    );
  });

  const result = await client.query(
    `INSERT INTO pending_donation_items (
       pending_donation_id,
       line_no,
       description,
       product_id,
       quantity,
       unit,
       estimated_value_zar,
       requested_category,
       resolved_category,
       routing_status,
       storage_area_hint,
       source,
       status,
       flag_id
     ) VALUES ${placeholders.join(', ')}
     RETURNING *;`,
    params
  );

  return result.rows;
};

const getPendingDonationById = async (id, client = pool) => {
  const donationResult = await client.query(
    `SELECT * FROM pending_donations WHERE id = $1;`,
    [id]
  );

  if (!donationResult.rows[0]) {
    return null;
  }

  const itemsResult = await client.query(
    `SELECT * FROM pending_donation_items
     WHERE pending_donation_id = $1
     ORDER BY line_no ASC, id ASC;`,
    [id]
  );

  return {
    ...donationResult.rows[0],
    items: itemsResult.rows,
  };
};

const updatePendingDonationStatus = async (id, status, extraFields = {}, client = pool) => {
  const fieldEntries = Object.entries(extraFields || {}).filter(([key]) => key !== 'updated_at');
  const setClauses = ['status = $1', 'updated_at = NOW()'];
  const params = [status];

  fieldEntries.forEach(([key, value]) => {
    setClauses.push(`${key} = $${params.length + 1}`);
    params.push(coerceValue(value));
  });

  const query = `UPDATE pending_donations SET ${setClauses.join(', ')} WHERE id = $${params.length + 1} RETURNING *;`;
  const result = await client.query(query, [...params, id]);
  return result.rows[0] || null;
};

const lockPendingDonationForUpdate = async (id, client) => {
  if (!client) {
    throw new Error('lockPendingDonationForUpdate requires an explicit client instance.');
  }

  const result = await client.query(
    `SELECT * FROM pending_donations WHERE id = $1 FOR UPDATE;`,
    [id]
  );

  return result.rows[0] || null;
};

const lockWarehouseManagerFlagForUpdate = async (id, client) => {
  if (!client) {
    throw new Error('lockWarehouseManagerFlagForUpdate requires an explicit client instance.');
  }

  const result = await client.query(
    `SELECT * FROM warehouse_manager_flags WHERE id = $1 FOR UPDATE;`,
    [id]
  );

  return result.rows[0] || null;
};

const createWarehouseManagerFlag = async (data = {}, client = pool) => {
  const payload = data || {};

  const row = {
    productId: payload.productId ?? payload.product_id ?? null,
    quantityKg: payload.quantityKg ?? payload.quantity_kg ?? null,
    reason: payload.reason ?? null,
    targetLocation: payload.targetLocation ?? payload.target_location ?? 'Intake Holding Area',
    createdBy: payload.createdBy ?? payload.created_by ?? null,
    status: payload.status ?? 'pending_classification',
    pendingDonationId: payload.pendingDonationId ?? payload.pending_donation_id ?? null,
    pendingDonationItemId: payload.pendingDonationItemId ?? payload.pending_donation_item_id ?? null,
  };

  const result = await client.query(
    `INSERT INTO warehouse_manager_flags (
        product_id,
        quantity_kg,
        reason,
        target_location,
        created_by,
        status,
        pending_donation_id,
        pending_donation_item_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;`,
    [
      row.productId,
      row.quantityKg,
      row.reason,
      row.targetLocation,
      row.createdBy,
      row.status,
      row.pendingDonationId,
      row.pendingDonationItemId,
    ]
  );

  return result.rows[0] || null;
};

const updateWarehouseManagerFlagPendingDonationLink = async (flagId, { pendingDonationId, pendingDonationItemId } = {}, client = pool) => {
  const result = await client.query(
    `UPDATE warehouse_manager_flags
      SET pending_donation_id = $1,
          pending_donation_item_id = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *;`,
    [
      pendingDonationId ?? null,
      pendingDonationItemId ?? null,
      flagId,
    ]
  );

  return result.rows[0] || null;
};

const countUnresolvedFlagsForPendingDonation = async (pendingDonationId, client) => {
  if (!client) {
    throw new Error('countUnresolvedFlagsForPendingDonation requires an explicit client instance.');
  }

  const result = await client.query(
    `SELECT COUNT(*)::int AS unresolved_flag_count
     FROM warehouse_manager_flags
     WHERE pending_donation_id = $1
       AND status IN ('pending', 'pending_classification');`,
    [pendingDonationId]
  );

  return Number(result.rows[0]?.unresolved_flag_count || 0);
};

const setPendingDonationCommittedId = async (id, donationId, client) => {
  if (!client) {
    throw new Error('setPendingDonationCommittedId requires an explicit client instance.');
  }

  const result = await client.query(
    `UPDATE pending_donations
     SET committed_donation_id = $1,
         updated_at = NOW()
     WHERE id = $2 AND status = 'committing'
     RETURNING *;`,
    [donationId, id]
  );

  return result.rows[0] || null;
};

const markPendingItemResolved = async (itemId, { resolvedCategory, routingStatus, storageAreaHint, resolvedBy } = {}, client = pool) => {
  const result = await client.query(
    // NOTE: no resolved_at column exists on pending_donation_items in the
    // live schema (only rejected_at); updated_at tracks resolution time.
    `UPDATE pending_donation_items
     SET status = 'resolved',
         resolved_category = $1,
         routing_status = $2,
         storage_area_hint = $3,
         resolved_by = $4,
         rejection_reason = NULL,
         rejected_at = NULL,
         updated_at = NOW()
     WHERE id = $5
     RETURNING *;`,
    [
     resolvedCategory ?? null,
     routingStatus ?? null,
     storageAreaHint ?? null,
     resolvedBy ?? null,
     itemId,
    ]
  );

  return result.rows[0] || null;
};

const markPendingItemCommitted = async (itemId, committedDonationItemId, client = pool) => {
  const result = await client.query(
    `UPDATE pending_donation_items
     SET status = 'committed',
         committed_donation_item_id = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *;`,
    [committedDonationItemId, itemId]
  );

  return result.rows[0] || null;
};

const listDonationItemsForDonation = async (donationId, client = pool) => {
  const result = await client.query(
    `SELECT *
     FROM donation_items
     WHERE donation_id = $1
     ORDER BY id ASC;`,
    [donationId]
  );

  return result.rows;
};

const markPendingItemRejected = async (itemId, rejectionReason, resolvedBy, client = pool) => {
  const result = await client.query(
    `UPDATE pending_donation_items
     SET status = 'rejected',
         rejection_reason = $1,
         resolved_by = $2,
         rejected_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *;`,
    [rejectionReason ?? null, resolvedBy ?? null, itemId]
  );

  return result.rows[0] || null;
};

// Donation Management page list: pending donations by status, each with its
// item rows merged in under `items`. Two queries + a JS merge keeps the row
// shape identical to getPendingDonationById ({...row, items}) so client code
// can consume either without branching.
const listPendingDonationsWithItems = async (statuses = [], client = pool) => {
  const cleanStatuses = Array.isArray(statuses) ? statuses.filter(Boolean) : [];
  if (cleanStatuses.length === 0) {
    return [];
  }

  const placeholders = cleanStatuses.map((_, index) => `$${index + 1}`).join(', ');
  const donationsResult = await client.query(
    `SELECT * FROM pending_donations
     WHERE status IN (${placeholders})
     ORDER BY created_at DESC, id DESC;`,
    cleanStatuses
  );

  if (donationsResult.rows.length === 0) {
    return [];
  }

  const donationIds = donationsResult.rows.map((row) => row.id);
  const idPlaceholders = donationIds.map((_, index) => `$${index + 1}`).join(', ');
  const itemsResult = await client.query(
    `SELECT * FROM pending_donation_items
     WHERE pending_donation_id IN (${idPlaceholders})
     ORDER BY line_no ASC, id ASC;`,
    donationIds
  );

  return donationsResult.rows.map((donation) => {
    const items = itemsResult.rows.filter((item) => item.pending_donation_id === donation.id);
    return {
      ...donation,
      items,
      item_counts: {
        total: items.length,
        resolved: items.filter((item) => item.status === 'resolved').length,
        awaiting_resolution: items.filter((item) => item.status === 'awaiting_resolution').length,
        rejected: items.filter((item) => item.status === 'rejected').length,
      },
    };
  });
};

const listPendingDonationsByStatus = async (statuses = [], client = pool) => {
  const cleanStatuses = Array.isArray(statuses) ? statuses.filter(Boolean) : [];
  if (cleanStatuses.length === 0) {
    return [];
  }

  const placeholders = cleanStatuses.map((_, index) => `$${index + 1}`).join(', ');
  const result = await client.query(
    `SELECT * FROM pending_donations
     WHERE status IN (${placeholders})
     ORDER BY created_at DESC, id DESC;`,
    cleanStatuses
  );

  return result.rows;
};

export default {
  createPendingDonation,
  createPendingDonationItems,
  getPendingDonationById,
  updatePendingDonationStatus,
  lockPendingDonationForUpdate,
  lockWarehouseManagerFlagForUpdate,
  createWarehouseManagerFlag,
  updateWarehouseManagerFlagPendingDonationLink,
  countUnresolvedFlagsForPendingDonation,
  setPendingDonationCommittedId,
  markPendingItemResolved,
  markPendingItemCommitted,
  listDonationItemsForDonation,
  markPendingItemRejected,
  listPendingDonationsByStatus,
  listPendingDonationsWithItems,
};
