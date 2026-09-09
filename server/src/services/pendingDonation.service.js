import pool from '../config/db.js';
import { determineRouting } from '../lib/donationRouting.js';
import pendingDonationRepository from '../repositories/pendingDonation.repository.js';
import donationAdminService from './donationAdmin.service.js';
import donationService from './donation.service.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const normalisePendingItem = (raw = {}, index = 0) => {
  const item = raw || {};
  return {
    lineNo: item.lineNo ?? item.line_no ?? index + 1,
    description: String(item.description ?? '').trim(),
    productId: item.productId ?? item.product_id ?? null,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    estimatedValueZar: item.estimatedValueZar ?? item.estimated_value_zar ?? null,
    requestedCategory: item.requestedCategory ?? item.requested_category ?? null,
    status: item.status ?? 'awaiting_resolution',
    flagId: item.flagId ?? item.flag_id ?? null,
    source: item.source ?? null,
    resolvedCategory: item.resolvedCategory ?? item.resolved_category ?? null,
    routingStatus: item.routingStatus ?? item.routing_status ?? null,
    storageAreaHint: item.storageAreaHint ?? item.storage_area_hint ?? null,
  };
};

// NOTE: no fallback to the donation-level category here — by design
// (BR-10 decision) an item with neither productId nor requestedCategory
// must ALWAYS go to manager review, never inherit the donation's
// category implicitly.
const routePendingItem = async (item) => {
  const category = item.requestedCategory ?? item.resolvedCategory ?? null;
  const routing = await determineRouting({
    productId: item.productId ?? null,
    category,
  });

  return {
    resolvedCategory: routing.category ?? null,
    routingStatus: routing.routing_outcome ?? null,
    storageAreaHint: routing.storage_area ?? null,
    source: routing.source ?? item.source ?? null,
    shouldFlag: !routing.category || routing.source === 'unclassified' || routing.routing_outcome === 'manual_review',
  };
};

const buildDonationPayloadFromPending = (pendingDonation) => {
  const acceptedItems = (pendingDonation.items || []).filter((item) => item.status === 'resolved');
  const totalValue = acceptedItems.reduce((sum, item) => {
    const value = Number(item.estimated_value_zar ?? item.estimatedValueZar ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    category: pendingDonation.donation_category ?? pendingDonation.donationCategory ?? null,
    programmeId: pendingDonation.programme_id ?? pendingDonation.programmeId ?? null,
    estimatedValueZar: totalValue,
    donorName: pendingDonation.donor_name ?? pendingDonation.donorName ?? null,
    donorContact: pendingDonation.donor_contact ?? pendingDonation.donorContact ?? null,
    donorTaxReference: pendingDonation.donor_tax_reference ?? pendingDonation.donorTaxReference ?? null,
    donorConsentGiven: pendingDonation.donor_consent_given ?? pendingDonation.donorConsentGiven ?? null,
    notes: pendingDonation.notes ?? null,
    idempotencyKey: pendingDonation.idempotency_key ?? pendingDonation.idempotencyKey ?? null,
    items: acceptedItems.map((item) => ({
      description: item.description,
      productId: item.product_id ?? item.productId ?? null,
      quantity: Number(item.quantity),
      unit: item.unit,
      estimatedValueZar: item.estimated_value_zar ?? item.estimatedValueZar ?? null,
      locationId: null,
      routingStatus: item.routing_status ?? item.routingStatus ?? 'allocated',
      routedCategory: item.resolved_category ?? item.resolvedCategory ?? null,
      routingOutcome: item.routing_status ?? item.routingStatus ?? 'allocated',
      routedSource: item.source ?? 'pending_donation',
      allocations: [],
    })),
  };
};

const sortPendingItemsByLine = (items = []) =>
  [...items].sort((a, b) => Number(a.line_no ?? a.lineNo ?? 0) - Number(b.line_no ?? b.lineNo ?? 0));

const sortDonationItemsById = (items = []) =>
  [...items].sort((a, b) => Number(a.id) - Number(b.id));

const assertDonationItemPairingIsComplete = (pendingItems, donationItems, context) => {
  if (pendingItems.length !== donationItems.length) {
    throw new Error(
      `${context}: expected ${pendingItems.length} donation item(s), found ${donationItems.length}.`
    );
  }
};

const linkPendingItemsToDonationItems = async (pendingItems, donationItems, client, context) => {
  const pendingAcceptedOrder = sortPendingItemsByLine(pendingItems);
  const donationItemOrder = sortDonationItemsById(donationItems);
  assertDonationItemPairingIsComplete(pendingAcceptedOrder, donationItemOrder, context);

  for (const [index, pendingItem] of pendingAcceptedOrder.entries()) {
    const matchingDonationItem = donationItemOrder[index];
    if (!matchingDonationItem?.id) {
      throw new Error(`${context}: missing real donation item for pending item ${pendingItem.id}.`);
    }

    await pendingDonationRepository.markPendingItemCommitted(
      pendingItem.id,
      matchingDonationItem.id,
      client
    );
  }
};

const savePendingDonationItemFlagLink = async (flagId, pendingDonationId, pendingDonationItemId, client) => {
  await pendingDonationRepository.updateWarehouseManagerFlagPendingDonationLink(
    flagId,
    { pendingDonationId, pendingDonationItemId },
    client
  );
};

const attemptCommitForPendingDonation = async (pendingDonationId) => {
  const pendingDonation = await pendingDonationRepository.getPendingDonationById(pendingDonationId);
  if (!pendingDonation) {
    throw new Error(`Pending donation ${pendingDonationId} was not found while committing.`);
  }

  const acceptedItems = (pendingDonation.items || []).filter((item) => item.status === 'resolved');
  if (acceptedItems.length === 0) {
    await pendingDonationRepository.updatePendingDonationStatus(
      pendingDonationId,
      'committed',
      { committed_at: new Date() },
      pool
    );
    return { pendingDonationId, donationId: pendingDonation.committed_donation_id ?? null, committed: true };
  }

  const payload = buildDonationPayloadFromPending(pendingDonation);
  const donationCreatorUserId = pendingDonation.created_by ?? pendingDonation.createdBy ?? null;
  let donationId = null;
  let committedDonationIdPersisted = false;

  try {
    const created = await donationService.createDonation(payload, donationCreatorUserId);
    const createdDonation = created?.donation || null;
    donationId = createdDonation?.id ?? created?.donationId ?? null;

    if (!donationId) {
      throw new Error('Donation creation succeeded but no donation ID was returned.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const committedRow = await pendingDonationRepository.setPendingDonationCommittedId(
        pendingDonationId,
        donationId,
        client
      );
      if (!committedRow) {
        await client.query('ROLLBACK');
        throw new Error(`Pending donation ${pendingDonationId} was no longer in committing state.`);
      }
      await client.query('COMMIT');
      committedDonationIdPersisted = true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const donationItems = createdDonation?.items || [];

    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      await linkPendingItemsToDonationItems(
        acceptedItems,
        donationItems,
        client2,
        `Pending donation ${pendingDonationId} finalization`
      );
      await pendingDonationRepository.updatePendingDonationStatus(
        pendingDonationId,
        'committed',
        { committed_at: new Date() },
        client2
      );

      await client2.query('COMMIT');
    } catch (error) {
      await client2.query('ROLLBACK');
      await pendingDonationRepository.updatePendingDonationStatus(
        pendingDonationId,
        'commit_incomplete',
        { commit_incomplete_at: new Date() },
        pool
      );
      console.error(`[pendingDonation.service] Commit finalization failed after real donation created for pending donation ${pendingDonationId}:`, error);
      throw error;
    } finally {
      client2.release();
    }

    return { pendingDonationId, donationId, committed: true };
  } catch (error) {
    if (!committedDonationIdPersisted) {
      await pendingDonationRepository.updatePendingDonationStatus(
        pendingDonationId,
        'commit_failed',
        { commit_failed_at: new Date() },
        pool
      );
    }
    console.error(`[pendingDonation.service] Failed to commit pending donation ${pendingDonationId}:`, error);
    throw error;
  }
};

export const createPendingDonationFromIntake = async (payload = {}) => {
  const data = payload || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pendingDonation = await pendingDonationRepository.createPendingDonation(
      {
        donorName: data.donorName ?? data.donor_name ?? null,
        donorContact: data.donorContact ?? data.donor_contact ?? null,
        donorTaxReference: data.donorTaxReference ?? data.donor_tax_reference ?? null,
        donorConsentGiven: data.donorConsentGiven ?? data.donor_consent_given ?? null,
        estimatedValueZar: data.estimatedValueZar ?? data.estimated_value_zar ?? null,
        donationCategory: data.donationCategory ?? data.donation_category ?? null,
        programmeId: data.programmeId ?? data.programme_id ?? null,
        notes: data.notes ?? null,
        section18aStatus: data.section18aStatus ?? data.section_18a_status ?? null,
        section18aQualifying: data.section18aQualifying ?? data.section_18a_qualifying ?? null,
        draftSnapshot: data.draftSnapshot ?? data.draft_snapshot ?? null,
        idempotencyKey: data.idempotencyKey ?? data.idempotency_key ?? null,
        createdBy: data.createdBy ?? data.created_by ?? null,
      },
      client
    );

    if (!pendingDonation) {
      await client.query('ROLLBACK');
      throw new Error('Failed to create pending donation row.');
    }

    const preparedItems = items.map((item, index) => normalisePendingItem(item, index));
    const createdItems = [];
    let unresolvedCount = 0;

    for (const item of preparedItems) {
      // No donation-level fallback: a blank item category always flags
      // for manager review (BR-10 decision), even when the donation
      // itself has a valid category.
      const routingPlan = await routePendingItem(item);
      const persistedItem = {
        ...item,
        source: routingPlan.source ?? item.source ?? null,
        resolvedCategory: routingPlan.resolvedCategory ?? item.resolvedCategory ?? null,
        routingStatus: routingPlan.routingStatus ?? item.routingStatus ?? null,
        storageAreaHint: routingPlan.storageAreaHint ?? item.storageAreaHint ?? null,
        status: routingPlan.shouldFlag ? 'awaiting_resolution' : 'resolved',
        flagId: null,
      };

      if (routingPlan.shouldFlag) {
        unresolvedCount += 1;

        // warehouse_manager_flags.product_id is NOT NULL, and the manager
        // resolution flow (finalizePendingClassification) UPDATES the
        // product row the flag points at. So an unmatched item first gets
        // an inactive placeholder product — same pattern as
        // processUnrecognizedDonationIntake — instead of a null product_id
        // (which would violate the constraint and 500 the whole request).
        let flagProductId = item.productId ?? null;
        if (!flagProductId) {
          const ts = Date.now();
          const safeName = `[Unclassified] ${item.description || `Pending donation line ${item.lineNo}`} (${ts})`;
          const placeholderRes = await client.query(
            `INSERT INTO products (
               name,
               stock_keeping_unit,
               storage_type,
               is_active,
               is_decantable,
               code_type,
               default_unit,
               is_perishable
             ) VALUES ($1, $2, 'dry', false, false, 'fixed', 'kg', false)
             RETURNING id;`,
            [safeName, `PENDING-${pendingDonation.id}-L${item.lineNo}-${ts}`]
          );
          flagProductId = placeholderRes.rows[0].id;
        }

        const flag = await pendingDonationRepository.createWarehouseManagerFlag(
          {
            productId: flagProductId,
            quantityKg: Number(item.quantity) || 0,
            reason: item.description || 'Unrecognized donation item requires manager classification.',
            targetLocation: 'Intake Holding Area',
            createdBy: data.createdBy ?? data.created_by ?? null,
            status: 'pending_classification',
            pendingDonationId: pendingDonation.id,
            pendingDonationItemId: null,
          },
          client
        );

        if (!flag) {
          await client.query('ROLLBACK');
          throw new Error(`Failed to create manager flag for pending donation item ${item.lineNo}.`);
        }

        persistedItem.flagId = flag.id;
      }

      const insertedRows = await pendingDonationRepository.createPendingDonationItems(
        pendingDonation.id,
        [persistedItem],
        client
      );
      const insertedItem = insertedRows[0] || null;
      if (!insertedItem) {
        await client.query('ROLLBACK');
        throw new Error(`Failed to create pending donation item ${item.lineNo}.`);
      }

      if (persistedItem.flagId) {
        await savePendingDonationItemFlagLink(persistedItem.flagId, pendingDonation.id, insertedItem.id, client);
      }

      createdItems.push(insertedItem);
    }

    const nextStatus = unresolvedCount === 0 ? 'committing' : 'awaiting_resolution';
    const finalPendingDonation = await pendingDonationRepository.updatePendingDonationStatus(
      pendingDonation.id,
      nextStatus,
      {},
      client
    );

    await client.query('COMMIT');

    const result = await pendingDonationRepository.getPendingDonationById(pendingDonation.id, pool);
    if (unresolvedCount === 0 && result) {
      await attemptCommitForPendingDonation(result.id);
    }

    return result || finalPendingDonation;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[pendingDonation.service] createPendingDonationFromIntake failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const resolveFlagAndMaybeCommit = async (flagId, resolution = {}) => {
  const data = resolution || {};
  const accepted = data.accepted === true;
  const reason = data.reason ?? null;
  const resolvedBy = data.resolvedBy ?? data.resolved_by ?? null;

  if (!flagId) {
    fail(400, 'Flag ID is required.');
  }
  if (!accepted && !reason) {
    fail(400, 'A rejection reason is required when a flag is rejected.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const flag = await pendingDonationRepository.lockWarehouseManagerFlagForUpdate(flagId, client);
    if (!flag) {
      await client.query('ROLLBACK');
      return await donationAdminService.finalizePendingClassification({
        flagId,
        name: 'Missing flag',
        sku: `FLAG-${flagId}`,
        storageType: 'dry',
        defaultUnit: 'kg',
        category: data.category ?? null,
        updatedBy: resolvedBy,
      });
    }

    const pendingDonationId = flag.pending_donation_id ?? null;
    if (!pendingDonationId) {
      await client.query('COMMIT');
      // Legacy (non-intake-linked) flag: falls through to plain finalize on
      // the flag's placeholder product. Resolution-form values submitted by
      // the manager (name/sku/storageType/defaultUnit) are honoured verbatim;
      // the historical placeholders only fill genuinely-absent fields. Blank
      // strings fall back too — finalize's own trimming would otherwise 400
      // on a half-typed form field. Intake-linked flags NEVER reach this
      // branch: their name/unit come from the linked pending_donation_item
      // further below, unchanged.
      return await donationAdminService.finalizePendingClassification({
        flagId,
        name: data.name || `Flag ${flagId}`,
        sku: data.sku || `FLAG-${flagId}`,
        storageType: data.storageType || 'dry',
        defaultUnit: data.defaultUnit || 'kg',
        category: data.category ?? null,
        updatedBy: resolvedBy,
      });
    }

    const pendingDonation = await pendingDonationRepository.getPendingDonationById(pendingDonationId, client);
    const item = (pendingDonation?.items || []).find((row) => row.flag_id === flag.id || row.id === flag.pending_donation_item_id);
    const finalCategory = data.category ?? item?.resolved_category ?? item?.requested_category ?? null;

    if (accepted && !finalCategory) {
      await client.query('ROLLBACK');
      fail(400, 'Accepted pending-donation resolutions require a category.');
    }

    // Pass our own transaction client: we hold SELECT ... FOR UPDATE on the
    // flag row, so finalizePendingClassification must run on THIS connection
    // or its UPDATE self-deadlocks against our lock from a second connection.
    await donationAdminService.finalizePendingClassification({
      flagId,
      name: item?.description || `Pending donation item ${flagId}`,
      sku: `PENDING-${flagId}`,
      storageType: 'dry',
      defaultUnit: item?.unit || 'kg',
      category: finalCategory,
      updatedBy: resolvedBy,
    }, client);

    const pendingItemId = flag.pending_donation_item_id ?? item?.id ?? null;
    if (!pendingItemId) {
      await client.query('ROLLBACK');
      fail(404, 'No pending donation item is linked to this flag.');
    }

    if (accepted) {
      await pendingDonationRepository.markPendingItemResolved(
        pendingItemId,
        {
          resolvedCategory: finalCategory,
          routingStatus: data.routingStatus ?? 'accepted',
          storageAreaHint: data.storageAreaHint ?? null,
          resolvedBy,
        },
        client
      );
    } else {
      await pendingDonationRepository.markPendingItemRejected(
        pendingItemId,
        reason,
        resolvedBy,
        client
      );
    }

    const pendingDonationRow = await pendingDonationRepository.lockPendingDonationForUpdate(pendingDonationId, client);
    const remainingUnresolved = await pendingDonationRepository.countUnresolvedFlagsForPendingDonation(pendingDonationId, client);

    if (remainingUnresolved === 0) {
      await pendingDonationRepository.updatePendingDonationStatus(
        pendingDonationId,
        'committing',
        {},
        client
      );
    } else {
      await pendingDonationRepository.updatePendingDonationStatus(
        pendingDonationId,
        'awaiting_resolution',
        {},
        client
      );
    }

    await client.query('COMMIT');

    if (remainingUnresolved === 0 && pendingDonationRow) {
      return await attemptCommitForPendingDonation(pendingDonationId);
    }

    return {
      pendingDonationId,
      status: remainingUnresolved === 0 ? 'committing' : 'awaiting_resolution',
      flagId,
      finalized: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[pendingDonation.service] resolveFlagAndMaybeCommit failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const retryCommit = async (pendingDonationId) => {
  if (!pendingDonationId) {
    fail(400, 'Pending donation ID is required.');
  }

  const pendingDonation = await pendingDonationRepository.getPendingDonationById(pendingDonationId, pool);
  if (!pendingDonation) {
    fail(404, 'Pending donation not found.');
  }

  if (pendingDonation.status === 'commit_failed') {
    // attemptCommitForPendingDonation persists the new donationId via
    // setPendingDonationCommittedId, which only matches rows already in
    // 'committing' (WHERE status = 'committing'). Every other caller
    // (createPendingDonationFromIntake, resolveFlagAndMaybeCommit) already
    // transitions to 'committing' before calling it; retryCommit must do
    // the same or the guard silently no-ops, the function throws "no
    // longer in committing state", and the outer catch re-stamps
    // commit_failed — a real donation gets created but the pending
    // donation row never reflects it, and the retry appears to fail on
    // every attempt even though nothing is actually wrong with the data.
    await pendingDonationRepository.updatePendingDonationStatus(
      pendingDonationId,
      'committing',
      {},
      pool
    );
    return await attemptCommitForPendingDonation(pendingDonationId);
  }

  if (pendingDonation.status === 'commit_incomplete') {
    const acceptedItems = (pendingDonation.items || []).filter((item) => item.status === 'resolved');
    const committedDonationId = pendingDonation.committed_donation_id ?? null;
    if (!committedDonationId) fail(409, 'Pending donation is in commit_incomplete but has no committed_donation_id.');

    const donationItems = await pendingDonationRepository.listDonationItemsForDonation(committedDonationId, pool);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await linkPendingItemsToDonationItems(
        acceptedItems,
        donationItems,
        client,
        `Pending donation ${pendingDonationId} retry finalization`
      );
      await pendingDonationRepository.updatePendingDonationStatus(
        pendingDonationId,
        'committed',
        { committed_at: new Date() },
        client
      );

      await client.query('COMMIT');
      return await pendingDonationRepository.getPendingDonationById(pendingDonationId, pool);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[pendingDonation.service] retryCommit for commit_incomplete failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  fail(409, `Retry commit is only valid for status 'commit_failed' or 'commit_incomplete'; current status is '${pendingDonation.status}'.`);
};

export default {
  createPendingDonationFromIntake,
  resolveFlagAndMaybeCommit,
  retryCommit,
};