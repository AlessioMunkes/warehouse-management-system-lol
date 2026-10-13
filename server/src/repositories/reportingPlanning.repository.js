// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingPlanning.repository.js
//
// Read-only rows for the workload heatmap on the Operations reports page
// (features/reporting/workload.js). Nothing is worked out here beyond
// the sums a query is the right place for. The reorder planner's rows
// come from stockCover.repository.js, shared with the other stock
// cover screens.
//
// Days and hours are South African throughout.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const SAST = (col) => `(${col} AT TIME ZONE 'Africa/Johannesburg')`;

/**
 * Recorded work per area, weekday (1 = Monday) and hour of the day,
 * for [from, to]: deliveries received, lines picked, pallets released.
 */
export const listWorkload = async ({ from, to }) => {
  const { rows } = await pool.query(
    `WITH work AS (
       SELECT 'receiving' AS area, ${SAST('dn.created_at')} AS at FROM delivery_notes dn
       UNION ALL
       SELECT 'packing', ${SAST('pe.created_at')} FROM picking_events pe
        WHERE pe.event_type IN ('item_confirmed', 'item_flagged')
       UNION ALL
       SELECT 'gate', ${SAST('de.collected_at')} FROM dispatch_events de
        WHERE de.collected_at IS NOT NULL AND de.status IN ('collected', 'late_collected')
     )
     SELECT area, EXTRACT(ISODOW FROM at)::int AS weekday, EXTRACT(HOUR FROM at)::int AS hour, COUNT(*)::int AS events
       FROM work
      WHERE at::date BETWEEN $1::date AND $2::date
      GROUP BY area, weekday, hour
      ORDER BY area, weekday, hour`,
    [from, to],
  );
  return rows;
};

export default { listWorkload };
