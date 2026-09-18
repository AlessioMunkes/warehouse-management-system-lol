// ─────────────────────────────────────────────────────────────
// server/src/repositories/collectionKit.repository.js
//
// Feed the Soil kit logging — the real, minimal mechanism the
// compost_processed reporting metric reads from (see
// reporting.repository.js's compostProcessed). Per the project's own
// visit notes: "Feed the soil - take food waste, turn to soil. goes
// to farmers, then we purchase (swapping food waste for compost -
// managing buckets)". A kit is one bucket's round trip: logged when
// it goes out with food waste, logged again when it comes back with
// compost.
//
// NOT TIED TO A BENEFICIARY CENTRE.
// This is warehouse-side food waste, not food going out to an ECD or
// soup kitchen — ecd_centres does not apply here, so there is no
// ecd_id on this table. A free-text `location` covers "which skip /
// which farmer" without inventing a beneficiary-shaped relationship
// that does not describe the real thing.
//
// A KIT COUNTS TOWARD compost_processed ONLY ONCE RETURNED.
// kg_compost_returned staying NULL while status is 'out' is not a
// missing value to backfill — it means the compost has not happened
// yet. reporting.repository.js's compostProcessed already only sums
// status = 'returned' rows; this file just has to keep that
// invariant true (returned_at and kg_compost_returned are set
// together, in markReturned, never independently).
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { logAudit } from './auditLog.repository.js';

const KIT_COLUMNS = `
  ck.id, ck.kit_label, ck.location, ck.date_out,
  ck.kg_food_waste_collected, ck.returned_at, ck.kg_compost_returned,
  ck.status, ck.notes, ck.logged_by, u.first_name AS logged_by_name,
  ck.created_at
`;

// Newest first — a manager checking this list wants to know what's
// still out today, not what went out first historically.
const listKits = async ({ status = null, limit = 100 } = {}) => {
  const params = [];
  const where = [];
  if (status) { params.push(status); where.push(`ck.status = $${params.length}`); }
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT ${KIT_COLUMNS}
       FROM collection_kits ck
       LEFT JOIN users u ON u.id = ck.logged_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ck.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
};

// FOR UPDATE on the same-label check: two workers logging "Bucket A1"
// out at the same moment must not both succeed — one bucket cannot be
// out twice, and the list screen would otherwise show two open rows
// for the same physical kit with no way to tell them apart.
const logKitOut = async ({ kitLabel, location, dateOut, kgFoodWasteCollected, notes, loggedBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: alreadyOut } = await client.query(
      `SELECT id FROM collection_kits WHERE kit_label = $1 AND status = 'out' FOR UPDATE`,
      [kitLabel]
    );
    if (alreadyOut[0]) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'already_out', kitId: alreadyOut[0].id };
    }

    const { rows } = await client.query(
      `INSERT INTO collection_kits
         (kit_label, location, date_out, kg_food_waste_collected, notes, logged_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'out')
       RETURNING id, kit_label, location, date_out, kg_food_waste_collected, status, created_at`,
      [kitLabel, location ?? null, dateOut, kgFoodWasteCollected, notes ?? null, loggedBy]
    );
    const kit = rows[0];

    await logAudit(client, {
      entityType: 'collection_kit',
      entityId:   kit.id,
      action:     'logged_out',
      actorId:    loggedBy,
      after:      kit,
    });

    await client.query('COMMIT');
    return { ok: true, kit };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// FOR UPDATE: two people closing the same kit at once should not both
// succeed and double-count the compost.
const markReturned = async ({ id, kgCompostReturned, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id, status FROM collection_kits WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const before = existing[0];
    if (!before) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'kit_not_found' };
    }
    if (before.status === 'returned') {
      await client.query('ROLLBACK');
      return { ok: false, code: 'already_returned' };
    }

    const { rows } = await client.query(
      `UPDATE collection_kits
          SET status = 'returned', returned_at = NOW(), kg_compost_returned = $2
        WHERE id = $1
        RETURNING id, kit_label, location, date_out, kg_food_waste_collected,
                  returned_at, kg_compost_returned, status`,
      [id, kgCompostReturned]
    );
    const kit = rows[0];

    await logAudit(client, {
      entityType: 'collection_kit',
      entityId:   kit.id,
      action:     'returned',
      actorId,
      before,
      after:      kit,
    });

    await client.query('COMMIT');
    return { ok: true, kit };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default { listKits, logKitOut, markReturned };
