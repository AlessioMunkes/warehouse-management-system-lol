// ─────────────────────────────────────────────────────────────
// server/src/features/communications/notices.js
//
// The in-app notifications the operational services raise, and their
// wording, in one place beside the emails.
//
// Each takes the caller's TRANSACTION CLIENT. A notification must
// never survive a change that was rolled back, so it is written inside
// the same transaction as the change it announces. The services pass
// these to their repository as `beforeCommit`; the repository calls it
// with its client just before COMMIT, and the deciding of what to say
// stays out of the SQL layer.
//
// NOT HERE YET: the low-stock notice. It is raised by
// stock.repository.js adjustStock, which runs inside six other
// repositories' transactions (receiving, dispatch, decanting, two
// donation paths, manual adjustment) rather than under a service of
// its own. Moving it means those transactions moving up into their
// services first.
// ─────────────────────────────────────────────────────────────
import { createNotification } from '../../repositories/notification.repository.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// picking.repository.js generateSlips
export const slipsGenerated = async (client, { created, cohort, dispatchDate, emptySlips = [] }) => {
  if (created <= 0) return;
  await createNotification(client, {
    type:  'picking_slips_generated',
    title: `${plural(created, 'picking slip')} generated`,
    body:  `${cohort}, ${dispatchDate}` + (emptySlips.length ? `. ${emptySlips.length} with no lines to check.` : '.'),
    entityType: 'picking_slip_run',
  });
};

// picking.repository.js createSlip
export const slipCreated = async (client, { slipId, ecdName, dispatchDate, itemCount }) => {
  await createNotification(client, {
    type:       'picking_slip_created',
    title:      `New picking slip created for ${ecdName}`,
    body:       `${dispatchDate}${itemCount === 0 ? '. No lines to check.' : '.'}`,
    entityType: 'picking_slip',
    entityId:   slipId,
  });
};

// picking.repository.js releaseSlip — the pallet is spare again: tell
// the floor, the same way a new slip is announced (the workers' bell
// and, for today's slips, their phones).
export const slipReleased = async (client, { slipId, ecdName }) => {
  await createNotification(client, {
    type:       'picking_slip_released',
    title:      `Pallet for ${ecdName ?? 'a centre'} is back on the floor`,
    body:       'Anyone can claim it.',
    entityType: 'picking_slip',
    entityId:   slipId,
  });
};

// dispatch.repository.js sweepNonCollections — BR-14: "the system
// must ... notify the Warehouse Manager." One summary per sweep, not
// one per pallet, matching slipsGenerated.
export const nonCollectionsFlagged = async (client, { flagged, dispatchDate, cutoffHour = 15 }) => {
  if (flagged <= 0) return;
  await createNotification(client, {
    type:  'non_collections_flagged',
    title: `${plural(flagged, 'pallet')} not collected by ${String(cutoffHour).padStart(2, '0')}:00`,
    body:  `Flagged automatically for ${dispatchDate}.`,
    entityType: 'dispatch_sweep',
  });
};

// purchaseOrder.repository.js updatePurchaseOrderStatus — only the two
// statuses that need someone.
export const purchaseOrderNeedsAttention = async (client, { purchaseOrder, status, reason }) => {
  if (!purchaseOrder || (status !== 'returned' && status !== 'follow_up_required')) return;
  await createNotification(client, {
    type:       'purchase_order_needs_attention',
    title:      `Purchase order ${purchaseOrder.po_number} ${status === 'returned' ? 'returned' : 'needs follow-up'}`,
    body:       reason ?? null,
    entityType: 'purchase_order',
    entityId:   purchaseOrder.id,
  });
};

// delivery.repository.js createDelivery — a delivery came in short, so
// the order is Partially received and flagged Follow-up required. The
// same type as above, so it goes to the same people and opens the
// order; the body is what was short.
export const purchaseOrderDeliveredShort = async (client, { purchaseOrder, reason }) => {
  if (!purchaseOrder) return;
  await createNotification(client, {
    type:       'purchase_order_needs_attention',
    title:      `Follow-up required: ${purchaseOrder.po_number} was delivered short`,
    body:       reason ?? null,
    entityType: 'purchase_order',
    entityId:   purchaseOrder.id,
  });
};

// communityRequestStock.repository.js recheckProducts — an approved
// benevolent request lost stock to a pallet (or a stock change) and now
// needs other items. Sent once per request while it stays flagged; the
// caller only gets here the first time the flag is raised. Managers and
// admins, who are the ones who can choose other items.
export const communityRequestItemsShort = async (client, { requestId, cause }) => {
  await createNotification(client, {
    type:        'community_request_items_short',
    title:       `Benevolent request #${requestId} needs new items`,
    body:        cause === 'pallet'
      ? `Pallet packing used stock set aside for benevolent request #${requestId}. Choose other items.`
      : `Stock changed, so the items set aside for benevolent request #${requestId} are no longer all available. Choose other items.`,
    entityType:  'community_request',
    entityId:    requestId,
    targetRoles: ['manager', 'admin'],
  });
};

export default {
  slipsGenerated, slipCreated, slipReleased, nonCollectionsFlagged, purchaseOrderNeedsAttention,
  purchaseOrderDeliveredShort,
  communityRequestItemsShort,
};
