import pg from 'pg';

const { Pool } = pg;

// Validate required env vars exist before trying to connect
const required = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
const missing  = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`[db] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[db] Create a .env.local file — see .env.example for the required keys.');
  process.exit(1);
}

const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     Number(process.env.DB_PORT),
});

export default pool;