// ─────────────────────────────────────────────────────────────
// server/src/repositories/auditLog.repository.js
//
// BR-04's immutable trail, in one place.
//
// This began as a private helper inside donation.repository.js. The
// moment purchase orders needed the same insert, copying it would have
// created exactly the drift utils/validation.js already documents:
// the movement_type constraint and the role constants both went wrong
// because one fact was written down twice and only half of it was
// updated. audit_log's column list is a fact of that kind.
//
// TAKES THE CALLER'S CLIENT.
// Not optional and not defaulted to the pool. An audit row written on
// a different connection to the change it describes will survive that
// change being rolled back, and the trail then records something that
// never happened — worse than no trail, because it is believed.
//
// before/after are jsonb columns. pg serialises a plain object to
// jsonb correctly, so callers pass objects, not JSON.stringify output;
// stringifying first stores a jsonb STRING containing JSON, which
// then needs a second parse everywhere it is read.
// ─────────────────────────────────────────────────────────────

export const logAudit = async (client, {
  entityType,
  entityId,
  action,
  actorId     = null,
  reason      = null,
  approvedBy  = null,
  before      = null,
  after       = null,
}) => {
  if (!client) {
    throw new Error('logAudit requires the caller\'s transaction client.');
  }
  await client.query(
    `INSERT INTO audit_log
       (entity_type, entity_id, action, actor_id, reason, approved_by,
        before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entityType, entityId, action, actorId, reason, approvedBy, before, after]
  );
};

// donation.repository.js still has its own copy. Leaving it there for
// now rather than refactoring a file whose suite mocks pg — that swap
// is a separate change with its own test run.

export default { logAudit };
