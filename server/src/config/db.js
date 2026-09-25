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
import { createDbRouter, parseWarehouseUrls } from './dbRouter.js';
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
  console.error('[db] Create a .env.local file — see env.example for the required keys.');
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
const startupTargets = pool.isMultiWarehouse ? pool.warehouseCodes : [null];

Promise.all(
  startupTargets.map((code) =>
    pool.poolForWarehouse(code).query('SELECT 1').then(
      () => code,
      (err) => { throw Object.assign(err, { warehouse: code }); }
    )
  )
)
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
