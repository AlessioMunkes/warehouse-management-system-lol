// ─────────────────────────────────────────────────────────────
// server/src/repositories/vmsSync.repository.js
//
// All SQL for vms_sync.
// Database access only — no VMS calls, no retry orchestration,
// no transition rules. The service layer owns when and how to
// sync; here we only persist synchronization state.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const SYNC_COLUMNS = `
  sync_id, entity_type, entity_id, external_id, sync_status,
  last_attempt_at, last_success_at, error_message, created_at, updated_at
`;

// ── Create a sync record ──────────────────────────────────────
const createSyncRecord = async ({
  entityType,
  entityId,
  externalId = null,
  syncStatus,
  lastAttemptAt = null,
  lastSuccessAt = null,
  errorMessage = null,
}, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO public.vms_sync
       (entity_type, entity_id, external_id, sync_status,
        last_attempt_at, last_success_at, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SYNC_COLUMNS}`,
    [
      entityType,
      entityId,
      externalId ?? null,
      syncStatus,
      lastAttemptAt ?? null,
      lastSuccessAt ?? null,
      errorMessage ?? null,
    ]
  );
  return rows[0];
};

// ── One sync record by id ─────────────────────────────────────
const findById = async (syncId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${SYNC_COLUMNS} FROM public.vms_sync
       WHERE sync_id = $1`,
    [syncId]
  );
  return rows[0] ?? null;
};

// ── Sync record for a specific entity ─────────────────────────
const findByEntity = async (entityType, entityId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${SYNC_COLUMNS} FROM public.vms_sync
       WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  );
  return rows[0] ?? null;
};

// ── Pending sync records ──────────────────────────────────────
const findPending = async ({ limit = null } = {}, client = pool) => {
  const params = [];
  let limitClause = '';

  if (limit !== null) {
    params.push(limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const { rows } = await client.query(
    `SELECT ${SYNC_COLUMNS} FROM public.vms_sync
       WHERE sync_status = 'PENDING'
       ORDER BY created_at ASC
       ${limitClause}`,
    params
  );
  return rows;
};

// ── Failed sync records ───────────────────────────────────────
const findFailed = async ({ limit = null } = {}, client = pool) => {
  const params = [];
  let limitClause = '';

  if (limit !== null) {
    params.push(limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const { rows } = await client.query(
    `SELECT ${SYNC_COLUMNS} FROM public.vms_sync
       WHERE sync_status = 'FAILED'
       ORDER BY created_at ASC
       ${limitClause}`,
    params
  );
  return rows;
};

// ── Update sync status fields only ────────────────────────────
// sync_id, entity_type, entity_id, created_at are intentionally
// absent — identity is immutable.
const UPDATABLE = {
  externalId:    'external_id',
  syncStatus:    'sync_status',
  lastAttemptAt: 'last_attempt_at',
  lastSuccessAt: 'last_success_at',
  errorMessage:  'error_message',
};

const updateSyncStatus = async (entityType, entityId, changes, client = pool) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    params.push(changes[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return findByEntity(entityType, entityId, client);

  params.push(entityType, entityId);
  const { rows } = await client.query(
    `UPDATE public.vms_sync
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE entity_type = $${params.length - 1}
         AND entity_id = $${params.length}
       RETURNING ${SYNC_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

// ── Idempotent sync record upsert ─────────────────────────────
// One logical sync row per (entity_type, entity_id). Repeated
// calls update the existing row rather than creating duplicates.
const upsertSyncRecord = async (data, client = pool) => {
  const {
    entityType,
    entityId,
    externalId = null,
    syncStatus,
    lastAttemptAt = null,
    lastSuccessAt = null,
    errorMessage = null,
  } = data;

  const { rows } = await client.query(
    `INSERT INTO public.vms_sync
       (entity_type, entity_id, external_id, sync_status,
        last_attempt_at, last_success_at, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET
       external_id = EXCLUDED.external_id,
       sync_status = EXCLUDED.sync_status,
       last_attempt_at = EXCLUDED.last_attempt_at,
       last_success_at = EXCLUDED.last_success_at,
       error_message = EXCLUDED.error_message,
       updated_at = NOW()
     RETURNING ${SYNC_COLUMNS}`,
    [
      entityType,
      entityId,
      externalId ?? null,
      syncStatus,
      lastAttemptAt ?? null,
      lastSuccessAt ?? null,
      errorMessage ?? null,
    ]
  );
  return rows[0];
};

export default {
  createSyncRecord,
  findById,
  findByEntity,
  findPending,
  findFailed,
  updateSyncStatus,
  upsertSyncRecord,
};
