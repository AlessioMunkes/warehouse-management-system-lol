// ─────────────────────────────────────────────────────────────
// server/src/config/db.js
//
// Connects via a single DATABASE_URL connection string instead of
// five separate DB_* vars. This is the only change needed to move
// the app from a local/self-hosted Postgres instance to Supabase's
// hosted Postgres — every repository file's raw SQL, transactions,
// and FOR UPDATE locks work unchanged, because Supabase *is*
// Postgres under the hood.
//
// To move OFF Supabase again later: just point DATABASE_URL at a
// different Postgres instance. Nothing else in this file, or in
// any repository, needs to change.
// ─────────────────────────────────────────────────────────────
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('[db] Missing required environment variable: DATABASE_URL');
  console.error('[db] Create a .env.local file — see env.example for the required keys.');
  process.exit(1);
}

// Supabase (and most managed Postgres providers) require SSL.
// rejectUnauthorized: false trusts Supabase's cert chain without you
// having to vendor their CA bundle — standard practice for this setup.
// Set DB_SSL=false in .env.local if you point this at a local Postgres
// instance that doesn't use SSL at all.
const sslConfig =
  process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
});

// Surfaces connection drops (e.g. Supabase restarting, network blip)
// in the logs instead of letting them fail silently — pg.Pool emits
// this on any idle client that errors out.
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err.message);
});

export default pool;