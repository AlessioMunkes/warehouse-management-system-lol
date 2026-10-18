// ─────────────────────────────────────────────────────────────
// server/src/services/expiryDismissal.service.js
//
// A manager dismisses the expiry warning for one delivery of a product,
// with a reason, and can bring it back. While it is dismissed that
// delivery is left out of every expiry warning: the Inventory expiring
// tab and the dashboard tile, the outlook's "may expire" flag, the
// packers' use-first date, the reports and the daily job (all of which
// read lots through shelfLots.repository.js).
//
// Why it exists: which deliveries are still on the shelf is an estimate
// (features/stock/shelfLots.js), and workers do not always take the
// soonest date first. Each dismissal and each restore is written to the
// audit log in the same transaction: who, when and why.
//
// Role gating (manager/admin) is at the route layer; this validates the
// request and does the work.
// ─────────────────────────────────────────────────────────────
import dismissals from '../repositories/expiryDismissal.repository.js';
import { loadShelfLots } from '../repositories/shelfLots.repository.js';
import { logAudit } from '../repositories/auditLog.repository.js';
import { withTransaction } from '../utils/transaction.js';

export const MAX_REASON_LENGTH = 500;
const ENTITY = 'delivery_note_item_expiry';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const requireActor = (userId) => {
  if (!userId) fail(400, 'An authenticated user is required to dismiss an expiry warning.');
};

// The line must be one of this product's deliveries with a use-by date.
const requireLine = async (client, productId, lineId) => {
  const line = await dismissals.findLine(client, lineId);
  if (!line || line.product_id !== Number(productId) || !line.expiry_date) {
    fail(404, 'That delivery was not found for this product.');
  }
  return line;
};

const dismiss = async ({ productId, lineId, reason }, userId) => {
  requireActor(userId);
  const text = String(reason ?? '').trim();
  if (!text) fail(400, 'Say why the warning is being dismissed.');
  if (text.length > MAX_REASON_LENGTH) fail(400, `The reason must be ${MAX_REASON_LENGTH} characters or fewer.`);

  // What the estimate said at the time, for the record.
  const shelf = await loadShelfLots({ productIds: [Number(productId)] });
  const lot = shelf.get(Number(productId))?.lots.find((l) => l.lineId === Number(lineId)) ?? null;

  return withTransaction(async (client) => {
    const line = await requireLine(client, productId, lineId);
    let row;
    try {
      row = await dismissals.insert(client, { lineId: line.id, reason: text, userId });
    } catch (err) {
      if (err.code === '23505') fail(409, 'This warning is already dismissed.');
      throw err;
    }
    await logAudit(client, {
      entityType: ENTITY,
      entityId: String(line.id),
      action: 'expiry_warning_dismissed',
      actorId: userId,
      reason: text,
      after: {
        productId: line.product_id,
        productName: line.product_name,
        expiryDate: line.expiry_date,
        estimatedLeft: lot?.left ?? null,
        received: lot?.received ?? null,
        unit: lot?.unit ?? null,
      },
    });
    return row;
  });
};

const restore = async ({ productId, lineId }, userId) => {
  requireActor(userId);
  return withTransaction(async (client) => {
    const line = await requireLine(client, productId, lineId);
    const row = await dismissals.restore(client, { lineId: line.id, userId });
    if (!row) fail(409, 'This warning is not dismissed.');
    await logAudit(client, {
      entityType: ENTITY,
      entityId: String(line.id),
      action: 'expiry_warning_restored',
      actorId: userId,
      reason: row.reason,
      before: { productId: line.product_id, productName: line.product_name, expiryDate: line.expiry_date, dismissedBy: row.dismissed_by },
    });
    return row;
  });
};

export default { dismiss, restore };
