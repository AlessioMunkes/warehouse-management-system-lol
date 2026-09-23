// ─────────────────────────────────────────────────────────────
// server/src/config/dbRouter.js
//
// Builds the object db.js exports as `pool`. It has the same methods
// the codebase already calls on a pg.Pool (query, connect, on, end),
// so no repository or service changes. Behind them it picks a real
// pg.Pool per call:
//
//   Single-warehouse mode (WAREHOUSE_DB_URLS not set)
//     One pool on DATABASE_URL. Behaves exactly like the old db.js.
//     No warehouse context is needed or read.
//
//   Multi-warehouse mode (WAREHOUSE_DB_URLS set)
//     One pool per warehouse, chosen from the request's warehouse
//     context (warehouseContext.js). A query with no warehouse set
//     FAILS. There is deliberately no default database to fall back
//     to: a silent fallback is how one site's data ends up in
//     another's.
//
// Kept free of process.env and process.exit so it can be unit tested
// with a fake Pool. db.js does the environment wiring.
// ─────────────────────────────────────────────────────────────
import { isValidWarehouseCode } from './warehouseContext.js';

export class WarehouseContextError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WarehouseContextError';
    // A missing or unknown warehouse at this layer is a server bug
    // (the middleware validates the header long before a query runs),
    // so it surfaces as a 500, never as a client error.
    this.status = 500;
  }
}

const SINGLE = '__single__';

/**
 * Parses and validates WAREHOUSE_DB_URLS.
 * Returns null when the variable is unset or blank (single mode).
 * Throws with a readable message when it is set but wrong.
 */
export const parseWarehouseUrls = (raw) => {
  if (raw == null || String(raw).trim() === '') return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'WAREHOUSE_DB_URLS is not valid JSON. Expected {"cpt":"postgres://...","gauteng":"postgres://..."}.'
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('WAREHOUSE_DB_URLS must be a JSON object keyed by warehouse code.');
  }

  const codes = Object.keys(parsed);
  if (codes.length === 0) {
    throw new Error('WAREHOUSE_DB_URLS is empty. Unset it to run in single-warehouse mode.');
  }

  for (const code of codes) {
    if (!isValidWarehouseCode(code)) {
      throw new Error(
        `WAREHOUSE_DB_URLS key ${JSON.stringify(code)} is not a valid warehouse code ` +
        '(lowercase letters, digits and hyphens, 2-32 characters, starting with a letter).'
      );
    }
    const url = parsed[code];
    if (typeof url !== 'string' || url.trim() === '') {
      throw new Error(`WAREHOUSE_DB_URLS["${code}"] must be a non-empty connection string.`);
    }
  }

  // Two warehouses on one database would quietly merge their data.
  const seen = new Map();
  for (const code of codes) {
    const url = parsed[code].trim();
    if (seen.has(url)) {
      throw new Error(
        `WAREHOUSE_DB_URLS: "${seen.get(url)}" and "${code}" point at the same database. ` +
        'Every warehouse needs its own.'
      );
    }
    seen.set(url, code);
  }

  return Object.fromEntries(codes.map((c) => [c, parsed[c].trim()]));
};

/**
 * @param {object}   opts
 * @param {Function} opts.PoolImpl       pg.Pool, or a fake in tests
 * @param {object}   opts.ssl            passed to every pool
 * @param {string}   [opts.databaseUrl]  single mode
 * @param {object}   [opts.warehouseUrls] multi mode, from parseWarehouseUrls
 * @param {Function} opts.getWarehouse   returns the active warehouse code or null
 */
export const createDbRouter = ({ PoolImpl, ssl, databaseUrl, warehouseUrls, getWarehouse }) => {
  const multi = warehouseUrls != null;
  if (!multi && !databaseUrl) {
    throw new Error('createDbRouter: databaseUrl is required in single-warehouse mode.');
  }

  const pools     = new Map();
  const listeners = []; // [event, handler] pairs, applied to every pool

  const poolFor = (code) => {
    let p = pools.get(code);
    if (p) return p;

    const connectionString = multi ? warehouseUrls[code] : databaseUrl;
    if (!connectionString) {
      throw new WarehouseContextError(`[db] Unknown warehouse "${code}".`);
    }
    p = new PoolImpl({ connectionString, ssl });
    for (const [event, handler] of listeners) {
      p.on(event, (...args) => handler(...args, multi ? code : null));
    }
    pools.set(code, p);
    return p;
  };

  const resolve = () => {
    if (!multi) return poolFor(SINGLE);

    const code = getWarehouse();
    if (!code) {
      throw new WarehouseContextError(
        '[db] Query attempted with no active warehouse. HTTP requests get one from the ' +
        'warehouse middleware; scripts and jobs must wrap their work in runInWarehouse().'
      );
    }
    if (!Object.hasOwn(warehouseUrls, code)) {
      throw new WarehouseContextError(`[db] Unknown warehouse "${code}".`);
    }
    return poolFor(code);
  };

  // query and connect return promises in every caller, so a routing
  // failure is returned as a rejection rather than thrown. That keeps
  // it inside the caller's try/catch even when the call is not awaited
  // directly (e.g. inside Promise.all([...])).
  const router = {
    query(...args) {
      try { return resolve().query(...args); }
      catch (err) { return Promise.reject(err); }
    },

    connect(...args) {
      try { return resolve().connect(...args); }
      catch (err) { return Promise.reject(err); }
    },

    // Registered listeners apply to pools that already exist and to any
    // created later. In multi mode the handler also receives the
    // warehouse code as its last argument, for logging.
    on(event, handler) {
      listeners.push([event, handler]);
      for (const [code, p] of pools) {
        p.on(event, (...args) => handler(...args, multi ? code : null));
      }
      return router;
    },

    async end() {
      const all = [...pools.values()];
      pools.clear();
      await Promise.all(all.map((p) => p.end()));
    },

    // ── Not part of pg.Pool: used by startup checks and scripts ──
    isMultiWarehouse: multi,
    warehouseCodes: multi ? Object.keys(warehouseUrls) : [],

    /** The pool for one warehouse, bypassing context. Scripts only. */
    poolForWarehouse(code) {
      if (!multi) return poolFor(SINGLE);
      if (!Object.hasOwn(warehouseUrls, code)) {
        throw new WarehouseContextError(`[db] Unknown warehouse "${code}".`);
      }
      return poolFor(code);
    },
  };

  return router;
};
