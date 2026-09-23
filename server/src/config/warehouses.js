// ─────────────────────────────────────────────────────────────
// server/src/config/warehouses.js
//
// The warehouses this deployment serves, with display names.
//
// Codes come from WAREHOUSE_DB_URLS (see db.js). Names are optional:
//   WAREHOUSE_NAMES={"cpt":"Cape Town","gauteng":"Gauteng"}
// A warehouse with no name shows its code. Names are display text
// only; the code is what every check uses.
//
// There is deliberately no separate registry database. Each
// warehouse's own `users` table is the record of who works there and
// in what role; login reads it and carries the result in the session
// token (see login.route.js and auth.middleware.js).
// ─────────────────────────────────────────────────────────────
import { isValidWarehouseCode, currentWarehouse } from './warehouseContext.js';
import { parseWarehouseUrls } from './dbRouter.js';

// ── Which warehouses ──────────────────────────────────────────
// Read from WAREHOUSE_DB_URLS directly (not from db.js) so modules
// such as auth.middleware can ask without opening a database, which
// keeps them importable in unit tests. db.js validates the same
// variable at startup, so a bad value never gets this far.
const UNREAD = Symbol('unread'); // distinct from an unset variable (undefined)
let cachedRaw = UNREAD;
let cachedCodes = [];

/** Configured warehouse codes in order, or [] in single-warehouse mode. */
export const warehouseCodes = () => {
  const raw = process.env.WAREHOUSE_DB_URLS;
  if (raw !== cachedRaw) {
    const urls = parseWarehouseUrls(raw);
    cachedCodes = urls ? Object.keys(urls) : [];
    cachedRaw = raw;
  }
  return cachedCodes;
};

/** True when this deployment runs one database per warehouse. */
export const isMultiWarehouse = () => warehouseCodes().length > 0;

/**
 * Extra claims for a guest (volunteer) session token: the warehouse
 * they signed in at, so their later requests go to that site only.
 * Empty with one database, so the token is exactly as before.
 */
export const guestWarehouseClaim = () => {
  const code = currentWarehouse();
  return code ? { warehouse: code } : {};
};

/**
 * Parses WAREHOUSE_NAMES. Returns {} when unset or blank.
 * Throws with a readable message when it is set but wrong.
 */
export const parseWarehouseNames = (raw) => {
  if (raw == null || String(raw).trim() === '') return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('WAREHOUSE_NAMES is not valid JSON. Expected {"cpt":"Cape Town"}.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('WAREHOUSE_NAMES must be a JSON object keyed by warehouse code.');
  }

  const names = {};
  for (const [code, name] of Object.entries(parsed)) {
    if (!isValidWarehouseCode(code)) {
      throw new Error(`WAREHOUSE_NAMES key ${JSON.stringify(code)} is not a valid warehouse code.`);
    }
    if (typeof name !== 'string' || name.trim() === '' || name.length > 60) {
      throw new Error(`WAREHOUSE_NAMES["${code}"] must be a non-empty name of at most 60 characters.`);
    }
    names[code] = name.trim();
  }
  return names;
};

let cachedNames;
const names = () => {
  if (cachedNames === undefined) cachedNames = parseWarehouseNames(process.env.WAREHOUSE_NAMES);
  return cachedNames;
};

/** Display name for a warehouse code; falls back to the code itself. */
export const warehouseName = (code) => names()[code] || code;

/** Test hook: forget the cached names so a changed env is re-read. */
export const resetWarehouseNamesForTests = () => { cachedNames = undefined; };
