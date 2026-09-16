// -------------------------------------------------------------
// server/src/repositories/gmail.repository.js
//
// Data access only for Gmail OAuth connection credentials.
// No OAuth flow logic belongs here.
// -------------------------------------------------------------
import pool from '../config/db.js';

const getUsersIdSqlType = async (client = pool) => {
  const { rows } = await client.query(
    `SELECT udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'id'`
  );

  const udtName = rows[0]?.udt_name;
  if (udtName === 'uuid') return 'UUID';
  if (udtName === 'int4') return 'INTEGER';
  if (udtName === 'int8') return 'BIGINT';

  const err = new Error('Unsupported users.id type for Gmail connection storage.');
  err.status = 500;
  throw err;
};

const ensureGmailConnectionsTable = async (client = pool) => {
  const userIdType = await getUsersIdSqlType(client);

  await client.query(
    `CREATE TABLE IF NOT EXISTS gmail_connections (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       gmail_email VARCHAR(255),
       display_name VARCHAR(255),
       token_type VARCHAR(32) NOT NULL,
       scope TEXT NOT NULL,
       access_token_encrypted TEXT NOT NULL,
       refresh_token_encrypted TEXT NOT NULL,
       access_token_expires_at TIMESTAMPTZ,
       refresh_token_expires_at TIMESTAMPTZ,
       connected_by_user_id ${userIdType} REFERENCES users(id),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  // display_name: added after the original table creation. Existing
  // deployments get the column here; new tables get it in the DDL above.
  await client.query(
    `ALTER TABLE gmail_connections ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`
  );


  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_connections_connected_by_user_id
     ON gmail_connections(connected_by_user_id)`
  );

  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_gmail_connections_updated_at
     ON gmail_connections(updated_at)`
  );
};

const upsertConnection = async (
  {
    gmailEmail = null,
    displayName = null,
    tokenType,
    scope,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    connectedByUserId = null,
  },
  client = pool
) => {
  await ensureGmailConnectionsTable(client);

  const { rows } = await client.query(
    `INSERT INTO gmail_connections (
       gmail_email,
       display_name,
       token_type,
       scope,
       access_token_encrypted,
       refresh_token_encrypted,
       access_token_expires_at,
       refresh_token_expires_at,
       connected_by_user_id,
       created_at,
       updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT (connected_by_user_id)
     DO UPDATE SET
       gmail_email = EXCLUDED.gmail_email,
       display_name = EXCLUDED.display_name,
       token_type = EXCLUDED.token_type,
       scope = EXCLUDED.scope,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       updated_at = NOW()
     RETURNING id, gmail_email, display_name, token_type, scope, access_token_expires_at,
               refresh_token_expires_at, connected_by_user_id, created_at, updated_at`,
    [
      gmailEmail,
      displayName,
      tokenType,
      scope,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      connectedByUserId,
    ]
  );
  return rows[0] || null;
};

const findConnectionByUserId = async (userId, client = pool) => {
  const { rows } = await client.query(
    `SELECT id, gmail_email, display_name, token_type, scope, access_token_encrypted,
            refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at,
            connected_by_user_id, created_at, updated_at
     FROM gmail_connections
     WHERE connected_by_user_id = $1`,
    [userId]
  );
  return rows[0] || null;
};

// Donation emails (thank-you / Section 18A) are sent by the system,
// not by a specific admin, so they resolve the organisation's account
// as the most recently updated connection.
const findLatestConnection = async (client = pool) => {
  await ensureGmailConnectionsTable(client);
  const { rows } = await client.query(
    `SELECT id, gmail_email, display_name, token_type, scope, access_token_encrypted,
            refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at,
            connected_by_user_id, created_at, updated_at
     FROM gmail_connections
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  return rows[0] || null;
};

const deleteConnectionByUserId = async (userId, client = pool) => {
  const { rows } = await client.query(
    `DELETE FROM gmail_connections
     WHERE connected_by_user_id = $1
     RETURNING id`,
    [userId]
  );
  return rows[0] || null;
};

const updateDisplayNameByUserId = async (userId, displayName, client = pool) => {
  await ensureGmailConnectionsTable(client);
  const { rows } = await client.query(
    `UPDATE gmail_connections
     SET display_name = $2, updated_at = NOW()
     WHERE connected_by_user_id = $1
     RETURNING id, gmail_email, display_name, token_type, scope, access_token_expires_at,
               refresh_token_expires_at, connected_by_user_id, created_at, updated_at`,
    [userId, displayName]
  );
  return rows[0] || null;
};

export default {
  ensureGmailConnectionsTable,
  upsertConnection,
  findConnectionByUserId,
  findLatestConnection,
  deleteConnectionByUserId,
  updateDisplayNameByUserId,
};
