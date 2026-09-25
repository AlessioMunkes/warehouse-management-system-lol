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
import { isPositiveInt, isValidDateString } from '../utils/validation.js';
import { PO_STATUSES as PO_STATUS_LIST } from '../constants/purchaseOrderStatus.js';
import emailProvider from '../providers/email.provider.js';
// The Finance recipient managers save in the app (finance_report_email_settings).
// Replaced financeEmailFallback.service.js, which read FINANCE_EMAIL until
// feature/notification-fix brought this service onto staging.
import financeService from './finance.service.js';

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

Please capture this purchase order in QuickBooks, then enter the QuickBooks reference back into the WMS against ${purchaseOrder.po_number}.`;

  const rows = purchaseOrder.items.map((item) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e5e5;">${item.product_name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e5e5;text-align:right;">${item.expected_quantity} ${item.default_unit || ''}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e5e5;text-align:right;">${item.unit_price != null ? money(item.unit_price) : '—'}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e5e5;text-align:right;">${money(lineTotal(item))}</td>
    </tr>`).join('');

  const html = `
    <p>Purchase order <strong>${purchaseOrder.po_number}</strong> has been created and needs to be captured in QuickBooks.</p>
    <p><strong>Supplier:</strong> ${purchaseOrder.supplier_name}<br>
       <strong>Created:</strong> ${formatDate(purchaseOrder.created_at)} by ${createdBy}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead><tr>
        <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #333;">Item</th>
        <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #333;">Qty</th>
        <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #333;">Unit price</th>
        <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #333;">Line total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="3" style="padding:6px 12px;text-align:right;font-weight:600;">Total</td>
        <td style="padding:6px 12px;text-align:right;font-weight:600;">${money(total)}</td>
      </tr></tfoot>
    </table>
    <p>Please capture this purchase order in QuickBooks, then enter the QuickBooks reference back into the WMS against <strong>${purchaseOrder.po_number}</strong>.</p>
  `;

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
const notifyFinance = async (purchaseOrder) => {
  const { recipientEmail } = await financeService.getEmailSettings();
  if (!recipientEmail) return; // nothing configured — leave status null, no attempt logged

  const { subject, text, html } = buildFinanceEmail(purchaseOrder);

  let result;
  try {
    result = await emailProvider.sendEmail({ to: recipientEmail, subject, text, html }, null);
  } catch (err) {
    await repo.recordFinanceEmailAttempt(purchaseOrder.id, {
      status: 'failed',
      error: err.message || 'Finance email send failed.',
      attemptedAt: new Date(),
    });
    return;
  }

  if (result?.stubbed) return; // EMAIL_ENABLED=false — no real attempt was made

  await repo.recordFinanceEmailAttempt(purchaseOrder.id, {
    status: result?.sent === true ? 'sent' : 'failed',
    error: result?.sent === true ? null : (result?.error || result?.reason || 'Provider reported a failure.'),
    attemptedAt: new Date(),
  });
};

// ── Create ────────────────────────────────────────────────────
const createPurchaseOrder = async (body, userId) => {
  const payload = buildPayload(body);
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

  // Sent after commit, never before. Wrapped so a Gmail outage can
  // never turn a created PO into a failed API response — notifyFinance
  // already never throws, this is belt-and-braces.
  try {
    await notifyFinance(result.purchaseOrder);
  } catch {
    /* notifyFinance records its own failure; nothing more to do here */
  }

  return result.purchaseOrder;
};

// ── Read ──────────────────────────────────────────────────────
const listPurchaseOrders = async ({ status, supplierId } = {}) => {
  const cleanStatus = clean(status);
  if (cleanStatus && !PO_STATUS_LIST.includes(cleanStatus)) {
    throw fail(400, `Unknown status filter "${cleanStatus}".`);
  }
  if (supplierId !== undefined && supplierId !== null && supplierId !== ''
      && !isPositiveInt(supplierId)) {
    throw fail(400, 'A valid supplier ID is required.');
  }

  return repo.listPurchaseOrders({
    status:     cleanStatus,
    supplierId: isPositiveInt(supplierId) ? Number(supplierId) : null,
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

  const existing = await repo.getPurchaseOrderById(Number(rawId));
  if (!existing) throw fail(404, 'Purchase order not found.');
  if (existing.status === status) return existing;

  return repo.updatePurchaseOrderStatus(Number(rawId), status, reason);
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

// ── Update (pending only) ──────────────────────────────────────
// Reuses buildPayload/buildItems wholesale — an edit is validated
// exactly as hard as a fresh order, because it produces the same
// document a receiver will later check a delivery against.
const updatePurchaseOrder = async (rawId, body, userId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid purchase order ID is required.');
  const payload = buildPayload(body);
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
  listPurchaseOrders,
  getPurchaseOrder,
  setPurchaseOrderStatus,
  updatePurchaseOrder,
  deletePurchaseOrder,
  setQuickbooksReference,
};
