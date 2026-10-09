// ─────────────────────────────────────────────────────────────
// server/src/services/purchaseOrder.service.js
//
// Validation and business rules for raising a purchase order.
//
// Validated hard, like a supplier and unlike a prospect. A PO is the
// document the warehouse checks a delivery against; a wrong quantity
// here becomes a discrepancy the receiver has to argue about with a
// driver at the gate, which is precisely the argument Mcebisi should
// not be having (Warehouse Visit 2.5).
//
// Errors carry .status so purchaseOrder.controller.js's
// `err.status || 500` resolves — the picking and supplier convention,
// not the stock one.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/purchaseOrder.repository.js';
import supplierRepo from '../repositories/supplier.repository.js';
import { isPositiveInt, isValidDateString } from '../utils/validation.js';
import {
  PO_STATUSES as PO_STATUS_LIST, PO_MANUAL_TRANSITIONS, canMovePurchaseOrder,
} from '../constants/purchaseOrderStatus.js';
import communications from '../features/communications/communications.service.js';
import notices from '../features/communications/notices.js';
import { emailStyles, escapeHtml, renderLadlesEmail } from '../utils/emailTemplate.js';
// The Finance recipient managers save in the app (finance_report_email_settings).
// Replaced financeEmailFallback.service.js, which read FINANCE_EMAIL until
// feature/notification-fix brought this service onto staging.
import financeService from './finance.service.js';
import { FINANCE_EMAIL_ERRORS, safeFinanceEmailError } from '../utils/financeEmailError.js';
import {
  MAX_IMPORT_ROWS, tooManyRowsMessage, normalizePair, findDuplicateIndexes,
} from '../utils/quickbooksImport.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const clean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

// BR-07B, in one place, matching the CHECK constraint. Anything
// reading or writing a PO status reads it from here — movement_type
// drifted precisely because its allowed values were written twice.
// Moved to ../constants/purchaseOrderStatus.js so delivery.repository.js can
// read the same list without importing this service (which would be circular
// — the service imports the repository). Re-exported here unchanged so every
// existing `import { PO_STATUSES } from './purchaseOrder.service.js'` keeps
// working.
//
// Written as import-then-const rather than `export { X } from '...'` on
// purpose: module-loads.test.js parses each file by stripping the `export`
// keyword with a regex, and a re-export leaves `{ PO_STATUSES } from '...'`
// behind, which is a syntax error. The safety net caught it.
export const PO_STATUSES = PO_STATUS_LIST;

// Render runs UTC. Comparing an SAST calendar date against the
// container's today is wrong for two hours every night: between 00:00
// and 02:00 SAST the server still thinks it is yesterday, and a
// manager raising a PO for "today" would be told the date is past.
// Fixed +02:00 — South Africa has no DST.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const todayInSAST = () =>
  new Date(Date.now() + SAST_OFFSET_MS).toISOString().slice(0, 10);

const MAX_LINES = 100;

// ── Line validation ───────────────────────────────────────────
// Positional errors ("Line 3"), not product names: a manager who has
// entered the same product twice needs to know which row to fix, and
// both rows carry the same name.
const buildItems = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail(400, 'A purchase order needs at least one line item.');
  }
  if (raw.length > MAX_LINES) {
    throw fail(400, `A purchase order cannot have more than ${MAX_LINES} line items.`);
  }

  const seen = new Set();
  return raw.map((line, index) => {
    const position = index + 1;

    if (!isPositiveInt(line?.productId)) {
      throw fail(400, `Line ${position}: choose a product.`);
    }
    const productId = Number(line.productId);

    if (seen.has(productId)) {
      throw fail(400,
        `Line ${position} repeats a product already on this order. ` +
        'Combine the quantities into one line.');
    }
    seen.add(productId);

    const quantity = Number(line.expectedQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw fail(400, `Line ${position}: quantity must be a whole number above zero.`);
    }
    if (quantity > 1_000_000) {
      throw fail(400, `Line ${position}: quantity looks like a typo, check it.`);
    }

    // Optional and genuinely optional. Dry goods arrive in counted
    // units with no meaningful weight, and forcing a number here gets
    // zeros typed in that then read as "we expected 0kg".
    let expectedWeightKg = null;
    if (line.expectedWeightKg !== null && line.expectedWeightKg !== undefined
        && line.expectedWeightKg !== '') {
      expectedWeightKg = Number(line.expectedWeightKg);
      if (!Number.isFinite(expectedWeightKg) || expectedWeightKg < 0) {
        throw fail(400, `Line ${position}: expected weight must be zero or more.`);
      }
      expectedWeightKg = Math.round(expectedWeightKg * 1000) / 1000;
    }

    let unitPrice = null;
    if (line.unitPrice !== null && line.unitPrice !== undefined && line.unitPrice !== '') {
      unitPrice = Number(line.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw fail(400, `Line ${position}: unit price must be zero or more.`);
      }
      unitPrice = Math.round(unitPrice * 100) / 100;
    }

    return { productId, expectedQuantity: quantity, expectedWeightKg, unitPrice };
  });
};

// ── Header validation ─────────────────────────────────────────
const buildPayload = (body = {}) => {
  if (!isPositiveInt(body.supplierId)) {
    throw fail(400, 'Choose a supplier.');
  }

  const expectedDeliveryDate = clean(body.expectedDeliveryDate);
  if (!expectedDeliveryDate) {
    // Required by the service though the column is nullable. BR-07A
    // needs the warehouse told what to expect and when before each
    // instalment, and the receiving dropdown orders POs by this date —
    // a null sorts last and the PO is never found.
    throw fail(400, 'An expected delivery date is required.');
  }
  if (!isValidDateString(expectedDeliveryDate)) {
    throw fail(400, 'Expected delivery date must be a real date in YYYY-MM-DD form.');
  }
  if (expectedDeliveryDate < todayInSAST()) {
    throw fail(400, 'Expected delivery date cannot be in the past.');
  }

  const notes = clean(body.notes);
  if (notes && notes.length > 2000) {
    throw fail(400, 'Notes must be 2000 characters or fewer.');
  }

  // Accepted, never required. If the QuickBooks spike lands on "the
  // API will not create POs", the manager types the QBO number here
  // and it goes to quickbooks_object_map — the same row the automated
  // push will write, so the two paths converge.
  const quickbooksPoId = clean(body.quickbooksPoId);
  if (quickbooksPoId && quickbooksPoId.length > 50) {
    throw fail(400, 'QuickBooks reference must be 50 characters or fewer.');
  }

  return {
    supplierId: Number(body.supplierId),
    expectedDeliveryDate,
    notes,
    quickbooksPoId,
    items: buildItems(body.items),
  };
};

const money = (value) =>
  `R ${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

// Matches the estimated_value convention in listPurchaseOrders: a
// missing unit price counts as 0 rather than making the total unknown.
const lineTotal = (item) => item.expected_quantity * (item.unit_price ?? 0);

// ── Finance email ─────────────────────────────────────────────
// Interim design while API-based QuickBooks PO creation is blocked
// (see README): Finance is emailed the PO and captures it manually.
const buildFinanceEmail = (purchaseOrder) => {
  const total = purchaseOrder.items.reduce((sum, item) => sum + lineTotal(item), 0);
  const createdBy = purchaseOrder.created_by_name || 'a warehouse manager';

  const subject = `${purchaseOrder.po_number} · ${purchaseOrder.supplier_name} · ${money(total)} · capture in QuickBooks`;

  const textLines = purchaseOrder.items.map((item) => {
    const unit = item.default_unit ? ` ${item.default_unit}` : '';
    const unitPrice = item.unit_price != null ? money(item.unit_price) : 'no unit price';
    return `  - ${item.product_name}: ${item.expected_quantity}${unit} x ${unitPrice} = ${money(lineTotal(item))}`;
  }).join('\n');

  const text = `Purchase order ${purchaseOrder.po_number} has been created and needs to be captured in QuickBooks.

Supplier: ${purchaseOrder.supplier_name}
Created: ${formatDate(purchaseOrder.created_at)} by ${createdBy}

Line items:
${textLines}

Total: ${money(total)}

Capture this order in QuickBooks and type ${purchaseOrder.po_number} into the QuickBooks PO's Memo field. The system links the two automatically from your QuickBooks export.`;

  const rows = purchaseOrder.items.map((item) => `
    <tr>
      <td style="${emailStyles.td}">${escapeHtml(item.product_name)}</td>
      <td style="${emailStyles.td}text-align:right;">${escapeHtml(`${item.expected_quantity} ${item.default_unit || ''}`.trim())}</td>
      <td style="${emailStyles.td}text-align:right;">${item.unit_price != null ? escapeHtml(money(item.unit_price)) : '&mdash;'}</td>
      <td style="${emailStyles.td}text-align:right;">${escapeHtml(money(lineTotal(item)))}</td>
    </tr>`).join('');

  const html = renderLadlesEmail({
    title: 'Purchase order created',
    preheader: `Purchase order ${purchaseOrder.po_number} needs to be captured in QuickBooks.`,
    bodyHtml: `
      <p style="${emailStyles.paragraph}">Purchase order <strong>${escapeHtml(purchaseOrder.po_number)}</strong> has been created and needs to be captured in QuickBooks.</p>
      <p style="${emailStyles.paragraph}"><strong>Supplier:</strong> ${escapeHtml(purchaseOrder.supplier_name)}<br>
         <strong>Created:</strong> ${escapeHtml(formatDate(purchaseOrder.created_at))} by ${escapeHtml(createdBy)}</p>
      <table style="${emailStyles.table}">
        <thead><tr>
          <th style="${emailStyles.th}">Item</th>
          <th style="${emailStyles.th}text-align:right;">Qty</th>
          <th style="${emailStyles.th}text-align:right;">Unit price</th>
          <th style="${emailStyles.th}text-align:right;">Line total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3" style="${emailStyles.td}text-align:right;font-weight:700;">Total</td>
          <td style="${emailStyles.td}text-align:right;font-weight:700;">${escapeHtml(money(total))}</td>
        </tr></tfoot>
      </table>
      <p style="${emailStyles.note}">Capture this order in QuickBooks and type <strong>${escapeHtml(purchaseOrder.po_number)}</strong> into the QuickBooks PO's Memo field. The system links the two automatically from your QuickBooks export.</p>
    `,
  });
  return { subject, text, html };
};

// Never throws — a Gmail outage must not stop procurement. Status is
// computed from the send result and written ONLY after it resolves;
// writing it before (e.g. optimistically as 'sent') is exactly the
// invite-email bug this must not repeat.
//
// A stubbed result (EMAIL_ENABLED=false) is treated the same as no
// recipient configured: nothing actually left the building, so no
// status is recorded rather than falsely claiming 'sent'.
//
// Returns what happened: 'no_recipient' | 'stubbed' | 'sent' | 'failed'
// | 'in_progress' (another send for this PO is already running). Only
// 'sent' and 'failed' touch the status columns.
//
// What is stored is a short safe message (utils/financeEmailError.js),
// never the raw provider text; the raw text goes to the server log.
//
// One send per PO at a time: the create-time send and a Resend click
// cannot overlap and race each other's status write. The flag is
// always cleared in finally.
const sendsInFlight = new Set();

const notifyFinance = async (purchaseOrder, sentBy = null) => {
  if (sendsInFlight.has(purchaseOrder.id)) return 'in_progress';
  sendsInFlight.add(purchaseOrder.id);
  try {
    const { recipientEmail } = await financeService.getEmailSettings();
    if (!recipientEmail) return 'no_recipient'; // nothing configured — status left as is, no attempt logged

    const { subject, text, html } = buildFinanceEmail(purchaseOrder);

    let result;
    try {
      // Through the communications module so the send lands in message
      // history. It returns the provider's reply unchanged, so the
      // result handling below is the same as before.
      result = await communications.send({
        type: 'purchase_order_finance',
        to: recipientEmail, subject, text, html,
        related: { type: 'purchase_order', id: purchaseOrder.id },
        sentBy,
        sendAs: null,
      });
    } catch (err) {
      console.error('[purchaseOrder:financeEmail]', err.message);
      await repo.recordFinanceEmailAttempt(purchaseOrder.id, {
        status: 'failed',
        error: safeFinanceEmailError(err.message) ?? FINANCE_EMAIL_ERRORS.generic,
        attemptedAt: new Date(),
      });
      return 'failed';
    }

    if (result?.stubbed) return 'stubbed'; // EMAIL_ENABLED=false — no real attempt was made

    const sent = result?.sent === true;
    if (!sent) {
      console.error('[purchaseOrder:financeEmail]', result?.error || result?.reason || 'Provider reported a failure.');
    }
    await repo.recordFinanceEmailAttempt(purchaseOrder.id, {
      status: sent ? 'sent' : 'failed',
      error: sent ? null : (safeFinanceEmailError(result?.error || result?.reason) ?? FINANCE_EMAIL_ERRORS.generic),
      attemptedAt: new Date(),
    });
    return sent ? 'sent' : 'failed';
  } finally {
    sendsInFlight.delete(purchaseOrder.id);
  }
};

// ── Only what the supplier supplies ───────────────────────────
// A supplier with products listed against it (Suppliers → Products
// supplied) can only be ordered from for those. A supplier with none
// listed is not restricted, so an unfinished list never stops an order.
// The offending ids go back as missingProductIds, the same field the
// unknown-product error uses, so the form marks the rows.
const assertSupplierSupplies = async (payload) => {
  const allowed = await supplierRepo.getSuppliedProductIds(payload.supplierId);
  if (allowed.length === 0) return;
  const offending = [...new Set(payload.items.map((item) => item.productId))]
    .filter((productId) => !allowed.includes(productId));
  if (offending.length === 0) return;

  const err = fail(400, offending.length === 1
    ? 'One item is not something this supplier supplies. Remove it, or add it to the supplier under Suppliers.'
    : `${offending.length} items are not things this supplier supplies. Remove them, or add them to the supplier under Suppliers.`);
  err.missingProductIds = offending;
  throw err;
};

// ── Create ────────────────────────────────────────────────────
const createPurchaseOrder = async (body, userId) => {
  const payload = buildPayload(body);
  await assertSupplierSupplies(payload);
  const result  = await repo.createPurchaseOrder(payload, userId);

  if (!result.ok) {
    if (result.code === 'supplier_not_found') {
      throw fail(404, 'That supplier no longer exists.');
    }
    if (result.code === 'supplier_inactive') {
      throw fail(409,
        `${result.supplier.name} is deactivated and cannot be ordered from. ` +
        'Reactivate the supplier first.');
    }
    if (result.code === 'unknown_products') {
      // BR-05 routes unknown items to Configure Stock Codes rather
      // than inventing a product row here. The ids come back so the
      // form can mark the offending rows instead of clearing.
      const err = fail(400,
        'One or more items are not configured stock codes. ' +
        'Add them under Configure Stock Codes first.');
      err.missingProductIds = result.missing;
      throw err;
    }
    throw fail(500, 'Failed to create the purchase order.');
  }

  // Fire-and-forget, after commit. setImmediate runs it after the
  // controller has sent the response, so Gmail's latency (or an outage)
  // never delays or fails the create. The send writes its own status
  // once the attempt resolves; the catch keeps any error from becoming
  // an unhandled rejection.
  const created = result.purchaseOrder;
  setImmediate(() => {
    notifyFinance(created, userId).catch((err) => {
      console.error('[purchaseOrder:financeEmail]', err.message);
    });
  });

  return created;
};

// ── Read ──────────────────────────────────────────────────────
// The list page counts its tabs from what it fetched, so it asks for
// more than the repository's default of 50. Capped: an unbounded limit
// from a query string is a full-table read on request.
const MAX_LIST_LIMIT = 500;

const listPurchaseOrders = async ({ status, supplierId, limit } = {}) => {
  const cleanStatus = clean(status);
  if (cleanStatus && !PO_STATUS_LIST.includes(cleanStatus)) {
    throw fail(400, `Unknown status filter "${cleanStatus}".`);
  }
  if (supplierId !== undefined && supplierId !== null && supplierId !== ''
      && !isPositiveInt(supplierId)) {
    throw fail(400, 'A valid supplier ID is required.');
  }

  if (limit !== undefined && limit !== null && limit !== ''
      && (!isPositiveInt(limit) || Number(limit) > MAX_LIST_LIMIT)) {
    throw fail(400, `Limit must be a whole number from 1 to ${MAX_LIST_LIMIT}.`);
  }
  return repo.listPurchaseOrders({
    status:     cleanStatus,
    supplierId: isPositiveInt(supplierId) ? Number(supplierId) : null,
    ...(isPositiveInt(limit) ? { limit: Number(limit) } : {}),
  });
};

const getPurchaseOrder = async (rawId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');
  const purchaseOrder = await repo.getPurchaseOrderById(Number(rawId));
  if (!purchaseOrder) throw fail(404, 'Purchase order not found.');
  return purchaseOrder;
};

// ── Status transitions ─────────────────────────────────────────
// General-purpose, not approve-only: PurchaseOrderDetail.jsx's
// Approve button is the first caller, but 'returned'/
// 'follow_up_required' need the same mechanism and the same
// mandatory-reason rule the CHECK constraint already enforces on
// Returned (see PurchaseOrderDetail.jsx's own comment on that).
// The statuses in words, for a refusal a manager reads.
const PO_STATUS_WORDS = {
  pending: 'Pending approval', approved: 'Approved', in_transit: 'In transit',
  partially_received: 'Partially received', completed: 'Completed',
  returned: 'Returned', follow_up_required: 'Follow-up required',
};

const setPurchaseOrderStatus = async (rawId, body = {}) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');

  // PO_STATUSES is the CHECK constraint verbatim, so anything this
  // accepts is a value the database will store and anything it rejects
  // would have raised 23514. 'approved' is in the list — the manager's
  // Approve button depends on it — and 'received' is not.
  const status = clean(body.status);
  if (!status || !PO_STATUSES.includes(status)) {
    throw fail(400, `Unknown status "${status}". Must be one of: ${PO_STATUSES.join(', ')}.`);
  }

  const reason = clean(body.reason);
  if (status === 'returned' && !reason) {
    throw fail(400, 'A reason is required when marking a purchase order as returned.');
  }
  // A follow-up is a note to whoever picks it up next; without one it
  // says only that something is wrong.
  if (status === 'follow_up_required' && !reason) {
    throw fail(400, 'Say what needs following up when marking a purchase order for follow-up.');
  }

  const existing = await repo.getPurchaseOrderById(Number(rawId));
  if (!existing) throw fail(404, 'Purchase order not found.');
  if (existing.status === status) return existing;
  // Reopening a followed-up order returns it to Approved. Allowing a
  // follow-up on an order nobody has approved yet made that a way to
  // reach Approved without the approval.
  if (status === 'follow_up_required' && existing.status === 'pending') {
    throw fail(400, 'Approve this order before recording a follow-up.');
  }

  if (!canMovePurchaseOrder(existing.status, status)) {
    const label = (s) => PO_STATUS_WORDS[s] ?? s;
    const next = PO_MANUAL_TRANSITIONS[existing.status] ?? [];
    throw fail(409, next.length === 0
      ? `This order is ${label(existing.status)} and is closed. Its status cannot be changed.`
      : `An order that is ${label(existing.status)} cannot be changed to ${label(status)}. It can become: ${next.map(label).join(', ')}.`);
  }

  return repo.updatePurchaseOrderStatus(Number(rawId), status, reason, {
    beforeCommit: notices.purchaseOrderNeedsAttention,
  });
};

// ── Follow-up order ───────────────────────────────────────────
// What a manager does about an order that came in short: a second
// order for the remainder (see createFollowUpOrder in the repository
// and migration 043). The expected date is theirs to give; a week from
// today when they do not.
const FOLLOW_UP_DAYS = 7;

const createFollowUpOrder = async (rawId, body = {}, userId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');

  let expectedDeliveryDate = clean(body.expectedDeliveryDate);
  if (expectedDeliveryDate && !isValidDateString(expectedDeliveryDate)) {
    throw fail(400, 'Choose a real date for when the follow-up is expected.');
  }
  if (!expectedDeliveryDate) {
    expectedDeliveryDate = new Date(Date.now() + FOLLOW_UP_DAYS * 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
  }

  const result = await repo.createFollowUpOrder(Number(rawId), userId, { expectedDeliveryDate });
  if (!result.ok) {
    if (result.code === 'not_found') throw fail(404, 'Purchase order not found.');
    if (result.code === 'not_awaiting_follow_up') {
      throw fail(409, 'A follow-up order can only be raised on an order marked Follow-up required.');
    }
    if (result.code === 'has_follow_up') {
      throw fail(409, `This order already has a follow-up order, ${result.poNumber}.`);
    }
    if (result.code === 'supplier_inactive') {
      throw fail(409, `${result.supplierName} is no longer an active supplier. Raise a new order with another supplier instead.`);
    }
    if (result.code === 'nothing_outstanding') {
      throw fail(409, 'Nothing is outstanding on this order. Reopen it or mark it complete instead.');
    }
    throw fail(500, 'Failed to create the follow-up order.');
  }
  return repo.getPurchaseOrderById(result.id);
};

// ── QuickBooks reference ─────────────────────────────────────
// Same validation as buildPayload's quickbooksPoId at create time,
// applied again here since this is now the second place a manager can
// set it. An empty string clears the reference rather than being
// rejected — a PO can go back to "not linked" if it was entered in
// error.
const setQuickbooksReference = async (rawId, body = {}, actorId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');
  const id = Number(rawId);

  const quickbooksPoId = clean(body.quickbooksPoId);
  if (quickbooksPoId && quickbooksPoId.length > 50) {
    throw fail(400, 'QuickBooks reference must be 50 characters or fewer.');
  }

  const found = await repo.setQuickbooksReference(id, quickbooksPoId, actorId);
  if (!found) throw fail(404, 'Purchase order not found.');

  return repo.getPurchaseOrderById(id);
};

// ── QuickBooks links import ──────────────────────────────────
// The client reads the file and finds the pairs; these two endpoints
// only look up and fill in links. Nothing here creates or deletes a PO.
// Rows that can't be trusted are given a status and left out of the
// database round trip — a row's status never depends on a guess.
const DUPLICATE_MESSAGE =
  'This PO number or QuickBooks number appears in more than one row. Nothing is linked for it.';

const prepareImportPairs = (body) => {
  const raw = body?.pairs;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail(400, 'Choose a file with at least one PO number in it.');
  }
  if (raw.length > MAX_IMPORT_ROWS) throw fail(400, tooManyRowsMessage(raw.length));

  const normalized = raw.map((r) => ({ ...normalizePair(r), overwrite: r?.overwrite === true }));
  const valid = normalized.filter((n) => !n.invalid);
  const dupes = findDuplicateIndexes(valid);
  const checked = valid.filter((_, i) => !dupes.has(i));
  return { normalized, valid, dupes, checked };
};

// Walks the submitted order and slots each outcome back in.
const mergeImportResults = (prepared, checkedResults) => {
  const byPair = new Map(prepared.checked.map((p, i) => [p, checkedResults[i]]));
  const dupePairs = new Set([...prepared.dupes].map((i) => prepared.valid[i]));
  return prepared.normalized.map((n) => {
    const base = { poNumber: n.poNumber, quickbooksNumber: n.quickbooksNumber };
    if (n.invalid) return { ...base, status: 'invalid', message: n.invalid };
    if (dupePairs.has(n)) return { ...base, status: 'duplicate', message: DUPLICATE_MESSAGE };
    const { poId, displacedPoId, ...outcome } = byPair.get(n); // internal ids stay server-side
    return { ...base, ...outcome };
  });
};

const countByStatus = (rows) => rows.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

const previewQuickbooksImport = async (body = {}) => {
  const prepared = prepareImportPairs(body);
  const checkedResults = prepared.checked.length
    ? await repo.previewQuickbooksLinks(prepared.checked)
    : [];
  const rows = mergeImportResults(prepared, checkedResults);
  return { rows, counts: countByStatus(rows) };
};

const applyQuickbooksImport = async (body = {}, actorId) => {
  const prepared = prepareImportPairs(body);
  let checkedResults = [];
  if (prepared.checked.length) {
    try {
      checkedResults = await repo.applyQuickbooksLinks(prepared.checked, actorId);
    } catch (err) {
      // Someone linked one of these numbers between our check and our
      // write. The transaction has rolled back, so nothing was changed.
      if (err?.code === '23505') {
        throw fail(409, 'A QuickBooks number was linked by someone else while this ran. Nothing was changed. Preview the file again.');
      }
      throw err;
    }
  }
  const rows = mergeImportResults(prepared, checkedResults);
  return { rows, counts: countByStatus(rows) };
};

// ── Resend the Finance email ─────────────────────────────────
// Same send + status-write path as creation. Returns the PO as it now
// stands, so the caller sees the status the attempt left behind.
const resendFinanceEmail = async (rawId, userId = null) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');
  const id = Number(rawId);

  const purchaseOrder = await repo.getPurchaseOrderById(id);
  if (!purchaseOrder) throw fail(404, 'Purchase order not found.');

  const outcome = await notifyFinance(purchaseOrder, userId);
  if (outcome === 'in_progress') {
    throw fail(409, 'Already sending. Wait a moment, then check the status.');
  }
  if (outcome === 'no_recipient') {
    throw fail(400, FINANCE_EMAIL_ERRORS.noRecipient);
  }
  if (outcome === 'stubbed') {
    throw fail(503, 'Email is turned off. Ask an admin to turn it on.');
  }

  return repo.getPurchaseOrderById(id);
};

// ── Update (pending only) ──────────────────────────────────────
// Reuses buildPayload/buildItems wholesale — an edit is validated
// exactly as hard as a fresh order, because it produces the same
// document a receiver will later check a delivery against.
const updatePurchaseOrder = async (rawId, body, userId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');
  const payload = buildPayload(body);
  await assertSupplierSupplies(payload);
  const result  = await repo.updatePurchaseOrder(Number(rawId), payload, userId);

  if (!result.ok) {
    if (result.code === 'not_found') throw fail(404, 'Purchase order not found.');
    if (result.code === 'not_editable') {
      throw fail(409,
        `This purchase order is "${result.status}" and can no longer be edited — ` +
        'only a pending order, not yet approved, can be changed.');
    }
    if (result.code === 'supplier_not_found') {
      throw fail(404, 'That supplier no longer exists.');
    }
    if (result.code === 'supplier_inactive') {
      throw fail(409,
        `${result.supplier.name} is deactivated and cannot be ordered from. ` +
        'Reactivate the supplier first.');
    }
    if (result.code === 'unknown_products') {
      const err = fail(400,
        'One or more items are not configured stock codes. ' +
        'Add them under Configure Stock Codes first.');
      err.missingProductIds = result.missing;
      throw err;
    }
    throw fail(500, 'Failed to update the purchase order.');
  }

  return result.purchaseOrder;
};

// ── Delete (pending only, never received against) ─────────────
const deletePurchaseOrder = async (rawId, userId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');
  const result = await repo.deletePurchaseOrder(Number(rawId), userId);

  if (!result.ok) {
    if (result.code === 'not_found') throw fail(404, 'Purchase order not found.');
    if (result.code === 'not_deletable') {
      throw fail(409,
        `This purchase order is "${result.status}" and can no longer be deleted — ` +
        'only a pending order, not yet approved, can be removed. Mark it Returned instead.');
    }
    if (result.code === 'has_deliveries') {
      throw fail(409,
        'This purchase order already has deliveries recorded against it and cannot be deleted.');
    }
    throw fail(500, 'Failed to delete the purchase order.');
  }
};

export default {
  createPurchaseOrder,
  createFollowUpOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  setPurchaseOrderStatus,
  updatePurchaseOrder,
  deletePurchaseOrder,
  setQuickbooksReference,
  previewQuickbooksImport,
  applyQuickbooksImport,
  resendFinanceEmail,
};
