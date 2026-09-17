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
      throw fail(400, `Line ${position}: quantity looks like a typo — check it.`);
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

export default {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  setPurchaseOrderStatus,
};
