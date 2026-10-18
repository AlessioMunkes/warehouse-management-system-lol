// ─────────────────────────────────────────────────────────────
// server/src/config/warehouseContext.js
//
// Which warehouse the current request is working in.
//
// Each warehouse has its own database (see the Multi-Warehouse
// Expansion Design doc). Rather than threading a warehouse argument
// through every controller, service and repository, the warehouse is
// held in request-scoped context using Node's AsyncLocalStorage.
// db.js reads it to pick the right connection pool, so repository
// code stays exactly as it is.
//
// The context follows the request through every await, including
// transactions opened with pool.connect(). Two requests running at the
// same time never see each other's warehouse.
//
// Set by the warehouse middleware for HTTP requests. Anything that runs
// outside a request (a script, a scheduled job) must call
// runInWarehouse() itself, once per warehouse.
// ─────────────────────────────────────────────────────────────
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

// Warehouse codes are short, lowercase and URL-safe: 'cpt', 'gauteng',
// 'northern-cape'. The same rule is applied to WAREHOUSE_DB_URLS keys,
// the X-Warehouse header and the registry, so a code is valid
// everywhere or nowhere.
export const WAREHOUSE_CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export const isValidWarehouseCode = (code) =>
  typeof code === 'string' && WAREHOUSE_CODE_PATTERN.test(code);

/**
 * Runs fn with `code` as the active warehouse. Returns fn's result, so
 * `await runInWarehouse('cpt', () => service.doThing())` works.
 */
export const runInWarehouse = (code, fn) => {
  if (!isValidWarehouseCode(code)) {
    throw new Error(`[warehouse] Invalid warehouse code: ${JSON.stringify(code)}`);
  }
  return storage.run({ warehouse: code }, fn);
};

/** The active warehouse code, or null when none has been set. */
export const currentWarehouse = () => storage.getStore()?.warehouse ?? null;
