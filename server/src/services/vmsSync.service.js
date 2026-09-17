// ─────────────────────────────────────────────────────────────
// server/src/services/vmsSync.service.js
//
// Owns vms_sync persistence transitions and the post-commit VMS
// call. NEVER called inside a DB transaction — EventBookingService
// commits/releases first, then triggers syncEntity().
//
// Sync states: PENDING, SYNCED, FAILED.
// Retry flow: FAILED -> PENDING -> attempt -> SYNCED/FAILED.
//
// queueSync stores intention only (PENDING, no external call).
// syncEntity / retrySync / retryFailedSyncs operate on existing
// local records; they never recreate event/timeslot rows.
// ─────────────────────────────────────────────────────────────
import vmsSyncRepo from '../repositories/vmsSync.repository.js';
import eventRepo from '../repositories/loveActivismEvent.repository.js';
import timeslotRepo from '../repositories/eventTimeslot.repository.js';
import vmsIntegrationService from './vmsIntegration.service.js';

const SYNC_STATUSES = ['PENDING', 'SYNCED', 'FAILED'];

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const nowIso = () => new Date().toISOString();

// queueSync stores intention only: upsert a PENDING row, no VMS call.
const queueSync = async (entityType, entityId, client = undefined) => {
  if (!entityType) fail(400, 'Entity type is required.');
  if (entityId === null || entityId === undefined || entityId === '') fail(400, 'Entity ID is required.');
  // Inside caller's transaction when client is provided, otherwise pool.
  const existing = client
    ? await vmsSyncRepo.findByEntity(entityType, entityId, client)
    : await vmsSyncRepo.findByEntity(entityType, entityId);
  if (client) {
    return vmsSyncRepo.upsertSyncRecord(
      {
        entityType,
        entityId,
        externalId: existing?.external_id ?? null,
        syncStatus: 'PENDING',
        lastAttemptAt: existing?.last_attempt_at ?? null,
        lastSuccessAt: existing?.last_success_at ?? null,
        errorMessage: null,
      },
      client
    );
  }
  return vmsSyncRepo.upsertSyncRecord({
    entityType,
    entityId,
    externalId: existing?.external_id ?? null,
    syncStatus: 'PENDING',
    lastAttemptAt: existing?.last_attempt_at ?? null,
    lastSuccessAt: existing?.last_success_at ?? null,
    errorMessage: null,
  });
};

// Build the outbound payload from existing local rows only.
const loadPublishPayload = async (entityType, entityId) => {
  const eventId = entityId;
  const event = await eventRepo.findById(eventId);
  if (!event) fail(404, 'Event not found for VMS sync.');
  const timeslots = await timeslotRepo.findByEventId(eventId);
  return { entityType, entityId, event, timeslots };
};

const markSynced = async (entityType, entityId, externalId) => {
  const at = nowIso();
  const row = await vmsSyncRepo.updateSyncStatus(entityType, entityId, {
    externalId,
    syncStatus: 'SYNCED',
    lastAttemptAt: at,
    lastSuccessAt: at,
    errorMessage: null,
  });
  // Successful publish may transition the event to PUBLISHED.
  if (entityType === 'event_booking' || entityType === 'love_activism_event' || entityType === 'event') {
    const event = await eventRepo.findById(entityId);
    if (event && event.status !== 'PUBLISHED') {
      await eventRepo.updateEvent(entityId, { status: 'PUBLISHED' });
    }
  }
  return row;
};

const markFailed = async (entityType, entityId, message) =>
  vmsSyncRepo.updateSyncStatus(entityType, entityId, {
    syncStatus: 'FAILED',
    lastAttemptAt: nowIso(),
    errorMessage: message ?? 'VMS sync failed.',
  });

// Post-commit only: publish one entity, then persist SYNCED/FAILED.
// Local data remains on VMS failure; sync becomes FAILED.
const syncEntity = async (entityType, entityId) => {
  if (!entityType) fail(400, 'Entity type is required.');
  if (entityId === null || entityId === undefined || entityId === '') fail(400, 'Entity ID is required.');
  let record = await vmsSyncRepo.findByEntity(entityType, entityId);
  if (!record) record = await queueSync(entityType, entityId);
  const payload = await loadPublishPayload(entityType, entityId);
  try {
    const result = await vmsIntegrationService.publishEventBooking(payload);
    return markSynced(entityType, entityId, result?.externalId ?? null);
  } catch (err) {
    return markFailed(entityType, entityId, err?.message);
  }
};

// Retry flow: FAILED -> PENDING -> attempt -> SYNCED/FAILED.
const retrySync = async (entityType, entityId) => {
  const existing = await vmsSyncRepo.findByEntity(entityType, entityId);
  if (!existing) fail(404, 'Sync record not found.');
  if (existing.sync_status !== 'FAILED') fail(409, 'Only FAILED syncs can be retried.');
  await vmsSyncRepo.updateSyncStatus(entityType, entityId, {
    syncStatus: 'PENDING',
    lastAttemptAt: existing.last_attempt_at ?? null,
    errorMessage: null,
  });
  return syncEntity(entityType, entityId);
};

const retryFailedSyncs = async ({ limit = null } = {}) => {
  const failed = await vmsSyncRepo.findFailed({ limit });
  const results = [];
  for (const row of failed) {
    results.push(await retrySync(row.entity_type, row.entity_id));
  }
  return results;
};

const getSyncStatus = async (entityType, entityId) => {
  if (!entityType) fail(400, 'Entity type is required.');
  if (entityId === null || entityId === undefined || entityId === '') fail(400, 'Entity ID is required.');
  const record = await vmsSyncRepo.findByEntity(entityType, entityId);
  if (!record) fail(404, 'Sync record not found.');
  if (!SYNC_STATUSES.includes(record.sync_status)) fail(500, 'Unknown sync status.');
  return record;
};

export default {
  queueSync,
  syncEntity,
  retrySync,
  retryFailedSyncs,
  getSyncStatus,
};

export { queueSync, syncEntity, retrySync, retryFailedSyncs, getSyncStatus };
