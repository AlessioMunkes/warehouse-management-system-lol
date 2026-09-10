// ─────────────────────────────────────────────────────────────
// server/src/services/stock.service.js
//
// Business logic for the inventory module.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import stockModel        from '../repositories/stock.repository.js';
import { isMovementType } from '../constants/movementTypes.js';

// ── fail ───────────────────────────────────────────────────────
// Mirrors picking.service.js. Without a `.status` on the error, the
// controller's `err.status || 500` sends every validation failure
// down the 500 branch, which replaces the message with a generic
// "Failed to adjust stock." — so the manager sees a blank error and
// no clue what was wrong. Attaching the status keeps the message.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ── Get the current manifest ────────────────────────────────
const getManifest = async () => {
  return await stockModel.getManifest();
};

// ── Get movement history for one product ──────────────────────
const getMovements = async (productId) => {
  if (!productId) fail(400, 'Product ID is required.');
  return await stockModel.getMovements(productId);
};

// ── Manual adjustment ──────────────────────────────────────────
// BR-02: every manual stock change requires a logged reason.
// Role gating (manager/admin only) happens at the route layer —
// this only validates the shape of the request.
// unit is intentionally optional here: the repository inherits the
// unit already on record for the product unless this is that
// product's first-ever movement, in which case it's required.
const adjustManually = async (data, userId) => {
  const { productId, quantityDelta, unit, reason } = data;
  const delta = Number(quantityDelta);

  if (!productId)                                    fail(400, 'Product is required.');
  if (quantityDelta === undefined || quantityDelta === null || !Number.isFinite(delta) || delta === 0)
                                                       fail(400, 'A non-zero quantity change is required.');
  if (!reason || !reason.trim())                      fail(400, 'A reason is required for manual adjustments.');

  const result = await stockModel.manualAdjust({
    productId,
    quantityDelta: delta,
    unit:          unit || null,
    reason:        reason.trim(),
    performedBy:   userId, // comes from JWT — never trusted from frontend
  });

  if (result.productNotFound) fail(404, 'Product not found.');

  return result;
};

// ── Ledger ─────────────────────────────────────────────────────
// The cursor is opaque on purpose. It encodes (created_at, id) — the
// keyset the repository pages on — but a client that parses it and
// starts constructing its own would be building on a detail that is
// free to change. Base64 says "hand this back to me, don't read it".
const encodeCursor = (cursor) =>
  cursor ? Buffer.from(`${new Date(cursor.createdAt).toISOString()}|${cursor.id}`, 'utf8').toString('base64') : null;

const decodeCursor = (raw) => {
  if (!raw) return null;
  let text;
  try {
    text = Buffer.from(String(raw), 'base64').toString('utf8');
  } catch {
    fail(400, 'That page cursor is not valid.');
  }
  const [createdAt, id] = text.split('|');
  const parsedId = Number(id);
  if (!createdAt || Number.isNaN(Date.parse(createdAt)) || !Number.isInteger(parsedId)) {
    fail(400, 'That page cursor is not valid.');
  }
  return { createdAt, id: parsedId };
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// A calendar date, compared against a SAST calendar date in SQL — so
// it is not parsed into an instant here. Doing that is what turns
// "2026-09-09" into 2026-09-08T22:00Z and loses a day.
const parseDate = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!DATE_ONLY.test(text) || Number.isNaN(Date.parse(text))) {
    fail(400, `${label} must be a calendar date (YYYY-MM-DD).`);
  }
  return text;
};

const MAX_LIMIT     = 200;
const DEFAULT_LIMIT = 50;

const parseLimit = (value) => {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    fail(400, `Limit must be a whole number between 1 and ${MAX_LIMIT}.`);
  }
  return n;
};

// Express gives ?type=a&type=b as an array and ?type=a as a string.
// Both shapes reach here, so both are normalised rather than one of
// them silently becoming a seven-character array of letters.
const parseMovementTypes = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const list = (Array.isArray(value) ? value : String(value).split(','))
    .map((t) => String(t).trim())
    .filter(Boolean);

  for (const t of list) {
    if (!isMovementType(t)) fail(400, `"${t}" is not a kind of stock movement.`);
  }
  return list;
};

const parseId = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(400, `${label} must be a valid id.`);
  return n;
};

const getLedger = async (query = {}) => {
  const from = parseDate(query.from, 'Start date');
  const to   = parseDate(query.to,   'End date');

  if (from && to && from > to) {
    fail(400, 'The start date is after the end date.');
  }

  const filters = {
    from,
    to,
    productId:     parseId(query.productId, 'Product'),
    performedBy:   parseId(query.performedBy, 'User'),
    movementTypes: parseMovementTypes(query.movementType ?? query.movementTypes),
    referenceType: query.referenceType ? String(query.referenceType).trim() : null,
    limit:         parseLimit(query.limit),
    cursor:        decodeCursor(query.cursor),
  };

  // The summary answers the same question as the page, so it takes
  // the same filters — but never the cursor or the limit, or the
  // totals would describe one page rather than the whole selection.
  const { cursor, limit, ...summaryFilters } = filters;

  const [page, summary] = await Promise.all([
    stockModel.getLedger(filters),
    stockModel.getLedgerSummary(summaryFilters),
  ]);

  return {
    movements:  page.rows,
    summary,
    nextCursor: encodeCursor(page.nextCursor),
  };
};

const getReconciliation = async () => {
  const rows = await stockModel.getReconciliation();
  return {
    products:  rows,
    variances: rows.filter((r) => Number(r.variance) !== 0),
  };
};

const getLedgerActors = async () => stockModel.getLedgerActors();

export default {
  getManifest, getMovements, adjustManually,
  getLedger, getReconciliation, getLedgerActors,
};