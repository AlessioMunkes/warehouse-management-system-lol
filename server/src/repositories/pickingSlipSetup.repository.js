// ─────────────────────────────────────────────────────────────
// server/src/repositories/pickingSlipSetup.repository.js
//
// Making picking slips and changing them before packing starts: a
// cohort's slips for a dispatch day, one slip at a time, and a manager's
// edit of a slip still pending. Everything after a slip is claimed
// (packing, flags, completion) is in picking.repository.js, which also
// hands these three on, so callers keep importing that one file.
// ─────────────────────────────────────────────────────────────
import pool             from '../config/db.js';
import recipeRepository from './recipe.repository.js';
import { logEvent }     from './pickingEvents.repository.js';

// ── One slip's lines ──────────────────────────────────────────
// From the recipe when there is one and it applies to this centre —
// each line times the centre's child count, rounded up to its band —
// and otherwise from the
// centre's own standing order. The standing order is the fallback for a
// centre marked as keeping its own order, a centre with no child count,
// and any date no filled-in recipe covers.
const insertSlipItems = async (client, { slipId, ecdId, dispatchDate, recipe }) => {
  if (recipe) {
    const rowCount = await recipeRepository.insertSlipItemsFromRecipe(client, {
      slipId, ecdId, recipeId: recipe.id, childBand: recipe.child_band,
    });
    if (rowCount > 0) return { rowCount, source: 'recipe' };
  }

  const { rowCount } = await client.query(
    `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
     SELECT $1, ol.product_id,
            -- Only a decantable product can be a part quantity; a
            -- standing order for 2.5 of anything else is 3 on the slip.
            CASE WHEN p.is_decantable THEN ol.quantity ELSE CEIL(ol.quantity) END,
            ol.unit
     FROM ecd_order_lines ol
     JOIN products p ON p.id = ol.product_id
     WHERE ol.ecd_id = $2
       AND ol.effective_from <= $3::date
       AND (ol.effective_to IS NULL OR ol.effective_to >= $3::date)
       AND p.archived_at IS NULL
     RETURNING id`,
    [slipId, ecdId, dispatchDate]
  );
  return { rowCount, source: 'standing_order' };
};

// The standing-order half of insertSlipItems, for many slips in one
// statement. `slips` is [{ id, ecd_id }]; returns slip id -> line count.
const insertStandingOrderItemsForMany = async (client, { slips, dispatchDate }) => {
  const counts = new Map();
  if (slips.length === 0) return counts;
  const { rows } = await client.query(
    `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
     SELECT s.slip_id, ol.product_id,
            CASE WHEN p.is_decantable THEN ol.quantity ELSE CEIL(ol.quantity) END,
            ol.unit
       FROM unnest($1::int[], $2::int[]) AS s(slip_id, ecd_id)
       JOIN ecd_order_lines ol ON ol.ecd_id = s.ecd_id
       JOIN products p ON p.id = ol.product_id
      WHERE ol.effective_from <= $3::date
        AND (ol.effective_to IS NULL OR ol.effective_to >= $3::date)
        AND p.archived_at IS NULL
     RETURNING picking_slip_id`,
    [slips.map((s) => s.id), slips.map((s) => s.ecd_id), dispatchDate]
  );
  for (const row of rows) counts.set(row.picking_slip_id, (counts.get(row.picking_slip_id) ?? 0) + 1);
  return counts;
};

// Many history lines in one statement, in the order given.
// `events` is [{ slipId, type, detail }].
const logEvents = async (client, events, actorId) => {
  if (events.length === 0) return;
  await client.query(
    `INSERT INTO picking_events (picking_slip_id, event_type, actor_id, detail)
     SELECT e.slip_id, e.event_type, $3::int, e.detail::jsonb
       FROM unnest($1::int[], $2::text[], $4::text[]) WITH ORDINALITY AS e(slip_id, event_type, detail, n)
      ORDER BY e.n`,
    [events.map((e) => e.slipId), events.map((e) => e.type), actorId, events.map((e) => JSON.stringify(e.detail ?? null))]
  );
};

// ── Generate a week's slips from ECD master data ──────────────
// Idempotent: the UNIQUE (ecd_id, dispatch_date) constraint means
// re-running for the same day updates nothing and creates nothing.
// Slips already in progress are never touched.
//
// An ECD with no effective order lines produces a slip with zero
// items, which then has zero pending lines and can be closed
// instantly with nothing packed. That is not blocked — food is never
// blocked on a data problem — but every such slip is returned in
// emptySlips so the manager can fix the master data before Monday.
// `beforeCommit(client, facts)`, when given, runs inside this
// transaction just before COMMIT — the service's notification goes in
// with the change or not at all (features/communications/notices.js).
const generateSlips = async ({ dispatchDate, cohort, generatedBy, beforeCommit }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slips = await client.query(
      `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, generated_by)
       SELECT e.id, $1::date, $2::cohort_group, $3
       FROM ecd_centres e
       WHERE e.cohort = $2::cohort_group
         AND e.is_active = TRUE
         AND e.approved_at IS NOT NULL
       ON CONFLICT (ecd_id, dispatch_date) DO NOTHING
       RETURNING id, ecd_id`,
      [dispatchDate, cohort, generatedBy]
    );

    const emptySlips = [];

    // The recipe for this dispatch date (Settings → Recipes), or null
    // when there is none to use — then every slip comes from the
    // centre's standing order, as it always did.
    const recipe = slips.rowCount > 0 ? await recipeRepository.resolveForDate(client, dispatchDate) : null;

    // Snapshot the lines onto each new slip. Copying (not joining) means a
    // later change to the recipe or to ecd_order_lines can never rewrite
    // a packed slip.
    //
    // For the whole cohort at once: the recipe lines in one statement,
    // the standing orders of whoever the recipe did not cover in a
    // second, the history in a third. It was two or three statements for
    // every slip, which for a hundred centres on a hosted database was
    // most of a minute with the manager watching a spinner.
    const fromRecipe = recipe
      ? await recipeRepository.insertSlipItemsFromRecipeForMany(client, {
          slips: slips.rows, recipeId: recipe.id, childBand: recipe.child_band,
        })
      : new Map();
    const rest = slips.rows.filter((slip) => !fromRecipe.has(slip.id));
    const fromOrder = await insertStandingOrderItemsForMany(client, { slips: rest, dispatchDate });

    const events = [];
    for (const slip of slips.rows) {
      const source = fromRecipe.has(slip.id) ? 'recipe' : 'standing_order';
      const itemCount = fromRecipe.get(slip.id) ?? fromOrder.get(slip.id) ?? 0;
      events.push({ slipId: slip.id, type: 'generated', detail: {
        dispatch_date: dispatchDate,
        item_count:    itemCount,
        source,
        ...(source === 'recipe' ? { recipe: recipe.name } : {}),
      } });
      if (itemCount === 0) {
        emptySlips.push({ slipId: slip.id, ecdId: slip.ecd_id });
        events.push({ slipId: slip.id, type: 'no_order_lines', detail: { dispatch_date: dispatchDate } });
      }
    }
    await logEvents(client, events, generatedBy);

    if (beforeCommit) {
      await beforeCommit(client, { created: slips.rowCount, cohort, dispatchDate, emptySlips });
    }

    await client.query('COMMIT');
    return { created: slips.rowCount, emptySlips };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Create a single new slip ───────────────────────────────────
// Same idempotent shape as generateSlips, scoped to one ECD — for a
// late-registered ECD, a correction, or any slip needed outside the
// normal cohort-wide generation run.
//
// `items`, when the caller supplies it, REPLACES the usual pull from
// ecd_order_lines — the manager typed or adjusted the lines by hand
// (including via meals-to-serve auto-calculation, done client-side)
// instead of taking the centre's standing order as-is. Omit it
// entirely to keep the original "pull from the standing order"
// behaviour generateSlips also relies on.
// `beforeCommit(client, facts)`, when given, runs inside this
// transaction just before COMMIT — the service's notification goes in
// with the change or not at all (features/communications/notices.js).
//
// A SOUP KITCHEN OR DIGNITY KITCHEN (`beneficiaryKind` other than
// 'ecd') has no row in ecd_centres and no standing order: the slip
// carries the kitchen's name itself (ps_beneficiary_consistency) and
// its lines are always the ones the manager typed. Everything after
// this insert is the same pallet as any other: claimed, packed,
// collected at the gate.
const createSlip = async ({ ecdId, beneficiaryKind = 'ecd', beneficiaryName = null, dispatchDate, cohort, generatedBy, items, beforeCommit }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const forCentre = beneficiaryKind === 'ecd';
    let ecdCheck = { rows: [{ name: beneficiaryName }] };
    let slipResult;

    if (forCentre) {
      ecdCheck = await client.query(
        `SELECT id, name FROM ecd_centres WHERE id = $1 AND is_active = TRUE AND approved_at IS NOT NULL`,
        [ecdId]
      );
      if (!ecdCheck.rows[0]) { await client.query('ROLLBACK'); return { ecdNotFound: true }; }

      slipResult = await client.query(
        `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, generated_by)
         VALUES ($1, $2, $3::cohort_group, $4)
         ON CONFLICT (ecd_id, dispatch_date) DO NOTHING
         RETURNING id`,
        [ecdId, dispatchDate, cohort, generatedBy]
      );
    } else {
      // The unique (ecd_id, dispatch_date) rule cannot see a slip with no
      // centre, so the same kitchen on the same day is checked by name.
      // The advisory lock makes two managers pressing Create at once
      // take turns, so both cannot pass the check.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`slip:${beneficiaryKind}:${beneficiaryName.toLowerCase()}:${dispatchDate}`]);
      const clash = await client.query(
        `SELECT 1 FROM picking_slips
          WHERE ecd_id IS NULL AND beneficiary_kind = $1::beneficiary_type
            AND LOWER(beneficiary_name) = LOWER($2) AND dispatch_date = $3::date
            AND status <> 'cancelled'
          LIMIT 1`,
        [beneficiaryKind, beneficiaryName, dispatchDate]
      );
      if (clash.rows[0]) { await client.query('ROLLBACK'); return { alreadyExists: true }; }

      slipResult = await client.query(
        `INSERT INTO picking_slips (ecd_id, beneficiary_kind, beneficiary_name, dispatch_date, cohort, generated_by)
         VALUES (NULL, $1::beneficiary_type, $2, $3, $4::cohort_group, $5)
         RETURNING id`,
        [beneficiaryKind, beneficiaryName, dispatchDate, cohort, generatedBy]
      );
    }

    if (!slipResult.rows[0]) { await client.query('ROLLBACK'); return { alreadyExists: true }; }

    const slipId = slipResult.rows[0].id;

    let itemCount;
    if (items) {
      for (const item of items) {
        await client.query(
          `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
           VALUES ($1, $2, $3, $4)`,
          [slipId, item.productId, item.quantity, item.unit]
        );
      }
      itemCount = items.length;
    } else {
      const recipe = await recipeRepository.resolveForDate(client, dispatchDate);
      const itemsResult = await insertSlipItems(client, { slipId, ecdId, dispatchDate, recipe });
      itemCount = itemsResult.rowCount;
    }

    await logEvent(client, slipId, 'generated', generatedBy, {
      dispatch_date: dispatchDate,
      mode:          'manual',
      item_count:    itemCount,
    });
    if (itemCount === 0) {
      await logEvent(client, slipId, 'no_order_lines', generatedBy, { dispatch_date: dispatchDate });
    }

    if (beforeCommit) {
      await beforeCommit(client, { slipId, ecdName: ecdCheck.rows[0].name, dispatchDate, itemCount });
    }

    await client.query('COMMIT');
    return { slipId, itemCount, ecdName: ecdCheck.rows[0].name };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Edit a pending slip ─────────────────────────────────────────
// Manager-only "fix it before it goes out": dispatch date, cohort,
// and/or the full set of product lines. Only reachable while the slip
// is still 'pending' — which is also the only state where every item
// on it is guaranteed to still be 'pending' too, since confirmItem/
// flagItem both require the slip to already be claimed. So there's no
// per-item lock to worry about here the way setItemStatus has to.
//
// `items`, when provided, REPLACES the slip's lines wholesale — the
// client sends the whole edited list, this deletes what's there and
// inserts what was sent, inside the same lock. Simpler and safer than
// diffing adds/removes/quantity-changes against the old set, and
// nothing yet references an item's own id externally at this stage —
// no confirm/flag has happened on a pending slip.
const editSlip = async ({ slipId, dispatchDate, cohort, items, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, ecd_id, status, dispatch_date, cohort FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    if (slip.status !== 'pending') {
      await client.query('ROLLBACK');
      return { locked: true, status: slip.status };
    }

    if (dispatchDate || cohort) {
      const nextDate = dispatchDate || slip.dispatch_date;
      const nextCohort = cohort || slip.cohort;

      // Same uniqueness this ECD's slips are created under
      // (createSlip's ON CONFLICT (ecd_id, dispatch_date)) — moving a
      // slip onto a date that already has one for this ECD is a
      // conflict, not a silent merge.
      const conflict = await client.query(
        `SELECT id FROM picking_slips WHERE ecd_id = $1 AND dispatch_date = $2::date AND id != $3`,
        [slip.ecd_id, nextDate, slipId]
      );
      if (conflict.rows[0]) {
        await client.query('ROLLBACK');
        return { dateConflict: true };
      }

      await client.query(
        `UPDATE picking_slips SET dispatch_date = $1::date, cohort = $2::cohort_group WHERE id = $3`,
        [nextDate, nextCohort, slipId]
      );
    }

    if (items) {
      await client.query(`DELETE FROM picking_slip_items WHERE picking_slip_id = $1`, [slipId]);
      for (const item of items) {
        await client.query(
          `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
           VALUES ($1, $2, $3, $4)`,
          [slipId, item.productId, item.quantity, item.unit]
        );
      }
    }

    // Reuses 'generated' rather than adding a new event_type — same
    // reasoning as reusing 'assigned' for a release/reassignment:
    // event_type is a DB-level CHECK constraint, and a label it has
    // never seen would roll back the one transaction a manager is
    // relying on to fix a mistake before it ships.
    await logEvent(client, slipId, 'generated', actorId, {
      edited: true,
      dispatch_date: dispatchDate || undefined,
      cohort: cohort || undefined,
      item_count: items ? items.length : undefined,
    });

    const updated = await client.query(`SELECT * FROM picking_slips WHERE id = $1`, [slipId]);

    await client.query('COMMIT');
    return { slip: updated.rows[0] };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export { generateSlips, createSlip, editSlip };
