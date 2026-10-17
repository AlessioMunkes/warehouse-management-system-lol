// ─────────────────────────────────────────────────────────────
// server/src/repositories/pickingEvents.repository.js
//
// A slip's history (picking_events). Written on the caller's client,
// inside the transaction of the change it records.
// ─────────────────────────────────────────────────────────────

// ── Audit helper (used inside existing transactions) ──────────
export const logEvent = async (client, slipId, eventType, actorId, detail = null) => {
  await client.query(
    `INSERT INTO picking_events (picking_slip_id, event_type, actor_id, detail)
     VALUES ($1, $2, $3, $4)`,
    [slipId, eventType, actorId, detail]
  );
};
