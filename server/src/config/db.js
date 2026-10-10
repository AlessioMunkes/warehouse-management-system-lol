// ─────────────────────────────────────────────────────────────
// server/src/config/db.js
//
// The database connection every repository imports as `pool`.
//
// Two modes, chosen by environment:
//
//   DATABASE_URL only (today's setup)
//     Single warehouse. One pg.Pool, exactly as before.
//
//   WAREHOUSE_DB_URLS set
//     One database per warehouse, as a JSON object keyed by code:
//       WAREHOUSE_DB_URLS={"cpt":"postgres://...","gauteng":"postgres://..."}
//     Each query goes to the database of the request's active
//     warehouse (see warehouseContext.js). DATABASE_URL is ignored.
//
// Either way the export has the pg.Pool methods the codebase uses
// (query, connect, on, end), so no repository changes between modes.
// The routing itself lives in dbRouter.js.
//
// Supabase (and most managed Postgres providers) require SSL.
// rejectUnauthorized: false trusts Supabase's cert chain without
// vendoring their CA bundle. Set DB_SSL=false for a local Postgres
// instance that doesn't use SSL at all.
// ─────────────────────────────────────────────────────────────
import pg from 'pg';
import { createDbRouter, parseWarehouseUrls, POOL_OPTIONS } from './dbRouter.js';
import { currentWarehouse } from './warehouseContext.js';

const { Pool } = pg;

const sslConfig =
  process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

let warehouseUrls;
try {
  warehouseUrls = parseWarehouseUrls(process.env.WAREHOUSE_DB_URLS);
} catch (err) {
  console.error(`[db] ${err.message}`);
  process.exit(1);
}

if (!warehouseUrls && !process.env.DATABASE_URL) {
  console.error('[db] Missing required environment variable: DATABASE_URL');
  console.error('[db] Create a server/.env file — see env.example for the required keys.');
  process.exit(1);
}

const pool = createDbRouter({
  PoolImpl:      Pool,
  ssl:           sslConfig,
  databaseUrl:   process.env.DATABASE_URL,
  warehouseUrls,
  getWarehouse:  currentWarehouse,
});

// Surfaces connection drops (e.g. Supabase restarting, network blip)
// in the logs instead of letting them fail silently — pg.Pool emits
// this on any idle client that errors out.
pool.on('error', (err, _client, warehouse) => {
  const where = warehouse ? ` (${warehouse})` : '';
  console.error(`[db] Unexpected error on idle client${where}:`, err.message);
});

// Fail fast at startup if any database is unreachable, as before.
// In multi mode every warehouse is checked: a site whose database is
// down should stop the deploy, not fail on its first request.
//
// It also opens the connections the pool keeps back (POOL_OPTIONS.min),
// side by side, so the first page somebody opens — which asks five or
// six things at once — does not wait for each to connect.
const startupTargets = pool.isMultiWarehouse ? pool.warehouseCodes : [null];
const warm = Math.max(1, Math.min(POOL_OPTIONS.min, POOL_OPTIONS.max));

//
// A FULL DATABASE IS WAITED FOR, NOT FATAL
// During a deploy the new server starts while the old one is still
// holding its connections, and the database allows only so many
// (dbRouter.js). The first try can find it full. Exiting there failed
// the deploy every time; the old server lets go within a minute, so
// this tries again for about that long before giving up. Any other
// failure (wrong password, wrong host) still stops at once.
const FULL = /EMAXCONN|max clients reached|too many clients|remaining connection slots/i;
const ATTEMPTS = 12;
const WAIT_MS = 5000;

const connectOnce = (code) =>
  // One connection proves the database is there. The rest of the ones
  // kept back are opened if there is room, and never fail the start.
  pool.poolForWarehouse(code).query('SELECT 1').then(() => {
    for (let i = 1; i < warm; i += 1) pool.poolForWarehouse(code).query('SELECT 1').catch(() => {});
    return code;
  });

const connectWithPatience = async (code) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await connectOnce(code);
    } catch (err) {
      if (!FULL.test(err.message ?? '') || attempt >= ATTEMPTS) throw Object.assign(err, { warehouse: code });
      console.warn(`[db] The database has no free connections (try ${attempt} of ${ATTEMPTS}); trying again in ${WAIT_MS / 1000}s.`);
      await new Promise((resolve) => { setTimeout(resolve, WAIT_MS); });
    }
  }
};

Promise.all(startupTargets.map(connectWithPatience))
  .then((codes) => {
    if (pool.isMultiWarehouse) {
      console.log(`[db] Connected to ${codes.length} warehouse database(s): ${codes.join(', ')}`);
    } else {
      console.log('[db] Connected');
    }
  })
  .catch((err) => {
    const where = err.warehouse ? ` (${err.warehouse})` : '';
    console.error(`[db] FAILED to connect${where}:`, err.message);
    process.exit(1);
  });

export default pool;
