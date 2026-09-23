// ─────────────────────────────────────────────────────────────
// server/src/repositories/collectionKit.repository.js
//
// Feed the Soil kit tracking — the real mechanism the compost_processed
// reporting metric reads from (see reporting.repository.js's
// compostProcessed). The lifecycle, per the user's own correction of an
// earlier "out/returned" model that had it backwards:
//
//   1. A collection kit (a bucket) is ASSIGNED to a community member —
//      collection_kits is that durable, owned asset. It is never
//      "checked out" and "checked in"; it stays with its owner.
//   2. The owner fills it with food waste over the week (or however
//      long) and it is brought IN to the warehouse, where the compost
//      is weighed. That weigh-in is one row in collection_kit_records
//      — status 'logged'. A kit can be logged again and again over its
//      lifetime; each visit is its own record, not an overwrite.
//   3. The logged compost eventually travels to a farmer. Dispatch is
//      per record, independent, and a manual action — there is no
//      batching/trip concept, because there is no data on which
//      farmer got how much from which record to model one.
//
// A KIT'S STATUS IS DERIVED, NEVER STORED.
// "assigned" / "logged" / "dispatched" is always the status of the
// kit's most recent record, or 'assigned' if it has none — see
// listKits' LATERAL join. Storing it as a column on collection_kits
// would just be a cache of this query that can go stale; the table has
// few enough rows that computing it live is not a cost worth paying
// for that risk.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { logAudit } from './auditLog.repository.js';

const KIT_COLUMNS = `
  k.id, k.owner_name, k.suburb, k.assigned_at, k.created_at
`;

// Every record list — the flat cross-kit list and a single kit's own
// history — uses this exact ordering: not-yet-dispatched first (what
// still needs a decision), dispatched pushed to the bottom (settled),
// newest first within each group. One SQL fragment so the two lists
// can never silently disagree on what "top of the list" means.
const RECORD_ORDER = `(r.status = 'dispatched') ASC, r.logged_at DESC, r.id DESC`;

// ── Assign a kit to an owner ──────────────────────────────────
const createKit = async ({ ownerName, suburb, assignedAt, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO collection_kits (owner_name, suburb, assigned_at)
       VALUES ($1, $2, $3)
       RETURNING ${KIT_COLUMNS.replace(/k\./g, '')}`,
      [ownerName, suburb ?? null, assignedAt]
    );
    const kit = rows[0];

    await logAudit(client, {
      entityType: 'collection_kit',
      entityId:   kit.id,
      action:     'assigned',
      actorId,
      after:      kit,
    });

    await client.query('COMMIT');
    return kit;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── List kits, each with its derived status ────────────────────
// search matches owner_name or suburb: how a worker who knows whose
// bucket is in front of them actually finds it, even though the list
// itself displays by kit code, not owner name.
//
// Same ordering principle as RECORD_ORDER: kits whose latest record
// still needs dispatching (or that have no records at all yet) sort
// first, fully settled ('dispatched') kits sink to the bottom, most
// recent activity first within each group.
const listKits = async ({ search = null } = {}) => {
  const params = [];
  const where = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(k.owner_name ILIKE $${params.length} OR k.suburb ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT ${KIT_COLUMNS},
            COALESCE(latest.status, 'assigned') AS status,
            latest.kg_compost AS last_kg_compost,
            latest.logged_at  AS last_logged_at
       FROM collection_kits k
       LEFT JOIN LATERAL (
         SELECT r.status, r.kg_compost, r.logged_at
           FROM collection_kit_records r
          WHERE r.kit_id = k.id
          ORDER BY r.logged_at DESC, r.id DESC
          LIMIT 1
       ) latest ON TRUE
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY (COALESCE(latest.status, 'assigned') = 'dispatched') ASC,
                COALESCE(latest.logged_at, k.assigned_at) DESC,
                k.id DESC`,
    params
  );
  return rows;
};

// ── One kit, with its full record history ──────────────────────
const getKitById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${KIT_COLUMNS},
            COALESCE(latest.status, 'assigned') AS status
       FROM collection_kits k
       LEFT JOIN LATERAL (
         SELECT r.status FROM collection_kit_records r
          WHERE r.kit_id = k.id
          ORDER BY r.logged_at DESC, r.id DESC
          LIMIT 1
       ) latest ON TRUE
      WHERE k.id = $1`,
    [id]
  );
  const kit = rows[0];
  if (!kit) return null;

  const { rows: records } = await pool.query(
    `SELECT r.id, r.kg_compost, r.logged_at, r.status, r.dispatched_at, r.dispatched_to, r.notes,
            u.first_name AS logged_by_name
       FROM collection_kit_records r
       LEFT JOIN users u ON u.id = r.logged_by
      WHERE r.kit_id = $1
      ORDER BY ${RECORD_ORDER}`,
    [id]
  );

  return { ...kit, records };
};

// ── One record, with its owning kit's identity ───────────────────
// The record-detail screen's fetch — same "open by id, refetch on
// every visit" shape as getKitById, rather than trusting whatever
// row shape a list screen happened to already hold in memory.
const getRecordById = async (recordId) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.kit_id, r.kg_compost, r.logged_at, r.status, r.dispatched_at, r.dispatched_to, r.notes,
            k.owner_name, k.suburb,
            u.first_name AS logged_by_name
       FROM collection_kit_records r
       JOIN collection_kits k ON k.id = r.kit_id
       LEFT JOIN users u ON u.id = r.logged_by
      WHERE r.id = $1`,
    [recordId]
  );
  return rows[0] ?? null;
};

// ── Log a compost weigh-in against a kit ────────────────────────
const logCompost = async ({ kitId, kgCompost, loggedAt, notes, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: kits } = await client.query(
      `SELECT id FROM collection_kits WHERE id = $1 FOR UPDATE`,
      [kitId]
    );
    if (!kits[0]) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'kit_not_found' };
    }

    const { rows } = await client.query(
      `INSERT INTO collection_kit_records
         (kit_id, kg_compost, logged_at, notes, logged_by, status)
       VALUES ($1, $2, $3, $4, $5, 'logged')
       RETURNING id, kit_id, kg_compost, logged_at, status, notes, created_at`,
      [kitId, kgCompost, loggedAt, notes ?? null, actorId]
    );
    const record = rows[0];

    await logAudit(client, {
      entityType: 'collection_kit_record',
      entityId:   record.id,
      action:     'logged',
      actorId,
      after:      record,
    });

    await client.query('COMMIT');
    return { ok: true, record };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Mark one record dispatched ──────────────────────────────────
// FOR UPDATE: two people dispatching the same record at once should
// not both succeed — that compost only leaves the building once.
// dispatchedTo names where it went (a farmer or a drop-off location)
// — the one piece of the old "batching" idea worth keeping without
// inventing a trip/batch record neither the data nor the workflow
// supports: which record went where, not how much of a shared load.
const markDispatched = async ({ recordId, actorId, dispatchedTo }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id, status FROM collection_kit_records WHERE id = $1 FOR UPDATE`,
      [recordId]
    );
    const before = existing[0];
    if (!before) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'record_not_found' };
    }
    if (before.status === 'dispatched') {
      await client.query('ROLLBACK');
      return { ok: false, code: 'already_dispatched' };
    }

    const { rows } = await client.query(
      `UPDATE collection_kit_records
          SET status = 'dispatched', dispatched_at = NOW(), dispatched_to = $2
        WHERE id = $1
        RETURNING id, kit_id, kg_compost, logged_at, status, dispatched_at, dispatched_to, notes`,
      [recordId, dispatchedTo]
    );
    const record = rows[0];

    await logAudit(client, {
      entityType: 'collection_kit_record',
      entityId:   record.id,
      action:     'dispatched',
      actorId,
      before,
      after:      record,
    });

    await client.query('COMMIT');
    return { ok: true, record };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Flat record list across every kit ────────────────────────────
// The main "what needs attention" view — not-yet-dispatched records
// surface first, dispatched ones sink to the bottom, per the user's
// own instruction. status filter narrows to one group when a screen
// wants only history or only the outstanding queue. search matches
// the owning kit's owner name or suburb — the same fields listKits
// already searches, so both tabs find the same person by the same
// typing.
const listRecords = async ({ status = null, search = null, limit = 200 } = {}) => {
  const params = [];
  const where = [];
  if (status) { params.push(status); where.push(`r.status = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(k.owner_name ILIKE $${params.length} OR k.suburb ILIKE $${params.length})`);
  }
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT r.id, r.kit_id, r.kg_compost, r.logged_at, r.status, r.dispatched_at, r.dispatched_to, r.notes,
            k.owner_name, k.suburb,
            u.first_name AS logged_by_name
       FROM collection_kit_records r
       JOIN collection_kits k ON k.id = r.kit_id
       LEFT JOIN users u ON u.id = r.logged_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${RECORD_ORDER}
      LIMIT $${params.length}`,
    params
  );
  return rows;
};

export default {
  createKit, listKits, getKitById, getRecordById, logCompost, markDispatched, listRecords,
};
