// ─────────────────────────────────────────────────────────────
// server/src/repositories/quickbooks.repository.js
//
// What the QuickBooks connection keeps, in three tables that were
// created for it and had no code until now:
//
//   quickbooks_connections   the one connected company and its tokens
//                            (encrypted before they reach this file)
//   quickbooks_sync_queue    one row per purchase order: where its send
//                            to QuickBooks stands, and why if it failed
//   quickbooks_object_map    the link once it is there. The same row the
//                            manual "QuickBooks PO number" and the file
//                            import write, so the three paths converge
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const ENTITY = 'purchase_order';
const OBJECT = 'PurchaseOrder';
const keyFor = (poId) => `purchase_order:${poId}:create`;
// The same key in SQL, for a query that joins orders to their send
// (the purchase order list, the dashboard's Needs attention count).
export const poSyncKeySql = (poIdExpr) => `'purchase_order:' || ${poIdExpr} || ':create'`;

// ── The connection ──────────────────────────────────────────
// One company at a time: the newest row is the connection.
const getConnection = async () => {
  const { rows } = await pool.query(
    `SELECT id, realm_id, token_type, scope, access_token_encrypted, refresh_token_encrypted,
            access_token_expires_at, refresh_token_expires_at, connected_by_user_id, created_at, updated_at
       FROM quickbooks_connections
      ORDER BY updated_at DESC
      LIMIT 1`,
  );
  return rows[0] ?? null;
};

// Connecting replaces whatever was there: a second company is a change
// of company, not a second connection.
const saveConnection = async ({ realmId, tokenType, scope, accessEncrypted, refreshEncrypted, accessExpiresAt, refreshExpiresAt, userId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM quickbooks_connections WHERE realm_id <> $1`, [realmId]);
    const { rows } = await client.query(
      `INSERT INTO quickbooks_connections
         (realm_id, token_type, scope, access_token_encrypted, refresh_token_encrypted,
          access_token_expires_at, refresh_token_expires_at, connected_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (realm_id) DO UPDATE
         SET token_type = EXCLUDED.token_type, scope = EXCLUDED.scope,
             access_token_encrypted = EXCLUDED.access_token_encrypted,
             refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
             access_token_expires_at = EXCLUDED.access_token_expires_at,
             refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
             connected_by_user_id = EXCLUDED.connected_by_user_id,
             updated_at = NOW()
       RETURNING id, realm_id`,
      [realmId, tokenType, scope, accessEncrypted, refreshEncrypted, accessExpiresAt, refreshExpiresAt, userId ?? null],
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updateTokens = async (id, { accessEncrypted, refreshEncrypted, accessExpiresAt, refreshExpiresAt }) => {
  await pool.query(
    `UPDATE quickbooks_connections
        SET access_token_encrypted = $2, refresh_token_encrypted = $3,
            access_token_expires_at = $4, refresh_token_expires_at = $5, updated_at = NOW()
      WHERE id = $1`,
    [id, accessEncrypted, refreshEncrypted, accessExpiresAt, refreshExpiresAt],
  );
};

const deleteConnection = async () => {
  const { rowCount } = await pool.query(`DELETE FROM quickbooks_connections`);
  return rowCount;
};

// ── Where each order's send stands ──────────────────────────
// `state` is this feature's own word, kept in payload:
//   synced | needs_match | failed | sending
// and mapped onto the table's status column so the two agree.
const STATUS_OF = { synced: 'succeeded', needs_match: 'pending', failed: 'failed', sending: 'in_flight' };

const recordSync = async (poId, { state, error = null, detail = {} }) => {
  await pool.query(
    `INSERT INTO quickbooks_sync_queue (entity_type, entity_id, operation, payload, status, attempts, last_error, idempotency_key)
     VALUES ($1, $2, 'create', $3::jsonb, $4::sync_status, 1, $5, $6)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET payload = EXCLUDED.payload, status = EXCLUDED.status, last_error = EXCLUDED.last_error,
           attempts = quickbooks_sync_queue.attempts + CASE WHEN EXCLUDED.status = 'in_flight' THEN 0 ELSE 1 END,
           updated_at = NOW()`,
    [ENTITY, poId, JSON.stringify({ state, ...detail }), STATUS_OF[state] ?? 'failed', error, keyFor(poId)],
  );
};

const getSync = async (poId) => {
  const { rows } = await pool.query(
    `SELECT q.payload, q.status::text AS status, q.attempts, q.last_error, q.updated_at,
            m.qbo_id, m.last_synced_at
       FROM (SELECT $1::int AS po_id) x
       LEFT JOIN quickbooks_sync_queue q ON q.idempotency_key = $2
       LEFT JOIN quickbooks_object_map m ON m.entity_type = $3 AND m.entity_id = x.po_id AND m.qbo_object_type = $4`,
    [poId, keyFor(poId), ENTITY, OBJECT],
  );
  return rows[0] ?? null;
};

const getLink = async (poId) => {
  const { rows } = await pool.query(
    `SELECT qbo_id FROM quickbooks_object_map WHERE entity_type = $1 AND entity_id = $2 AND qbo_object_type = $3`,
    [ENTITY, poId, OBJECT],
  );
  return rows[0]?.qbo_id ?? null;
};

// Returns false when that QuickBooks number is already linked to a
// different order here (qbo_map_unique_remote): the caller says so
// rather than moving the link.
const saveLink = async (poId, { qboId, syncToken = null }) => {
  try {
    await pool.query(
      `INSERT INTO quickbooks_object_map (entity_type, entity_id, qbo_object_type, qbo_id, sync_token, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (entity_type, entity_id) DO UPDATE
         SET qbo_object_type = EXCLUDED.qbo_object_type, qbo_id = EXCLUDED.qbo_id,
             sync_token = EXCLUDED.sync_token, last_synced_at = NOW()`,
      [ENTITY, poId, OBJECT, qboId, syncToken],
    );
    return true;
  } catch (err) {
    if (err.code === '23505') return false;
    throw err;
  }
};

// Orders approved while QuickBooks could not take them: still not
// linked, and not waiting on a person to fix a match.
const listUnsent = async (limit = 20) => {
  const { rows } = await pool.query(
    `SELECT po.id
       FROM purchase_orders po
       LEFT JOIN quickbooks_object_map m ON m.entity_type = $1 AND m.entity_id = po.id
       LEFT JOIN quickbooks_sync_queue q ON q.idempotency_key = 'purchase_order:' || po.id || ':create'
      WHERE po.status IN ('approved', 'in_transit', 'partially_received')
        AND m.entity_id IS NULL
        AND (q.id IS NULL OR q.status = 'failed')
      ORDER BY po.id
      LIMIT $2`,
    [ENTITY, limit],
  );
  return rows.map((r) => r.id);
};

export default {
  getConnection, saveConnection, updateTokens, deleteConnection,
  recordSync, getSync, getLink, saveLink, listUnsent,
};
