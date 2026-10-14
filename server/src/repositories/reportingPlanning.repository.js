// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingPlanning.repository.js
//
// Read-only rows for the workload report (reportCatalog.js `workload`,
// shaped by features/reporting/workload.js). Nothing is worked out here
// beyond the sums a query is the right place for. The reorder planner's
// rows come from stockCover.repository.js, shared with the other stock
// cover screens.
//
// Days and hours are South African throughout.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const SAST = (col) => `(${col} AT TIME ZONE 'Africa/Johannesburg')`;

/**
 * One row per piece of recorded work, as a subquery: { area, at, what }.
 * at is South African local time. Shared by the counts below and by the
 * records behind the report (reportingRecords.repository.js), so the
 * list a manager opens is exactly what was counted. No person is named.
 */
export const WORK_SQL = `(
       SELECT 'receiving' AS area, ${SAST('dn.created_at')} AS at,
              'Delivery note ' || dn.id AS what
         FROM delivery_notes dn
       UNION ALL
       SELECT 'packing', ${SAST('pe.created_at')},
              CASE pe.event_type WHEN 'item_flagged' THEN 'Line flagged' ELSE 'Line picked' END
                || ' on pallet P-' || pe.picking_slip_id
         FROM picking_events pe
        WHERE pe.event_type IN ('item_confirmed', 'item_flagged')
       UNION ALL
       SELECT 'gate', ${SAST('de.collected_at')},
              'Pallet P-' || de.picking_slip_id || ' released'
         FROM dispatch_events de
        WHERE de.collected_at IS NOT NULL AND de.status IN ('collected', 'late_collected')
     )`;

/**
 * Recorded work per area, weekday (1 = Monday) and hour of the day,
 * for [from, to]: deliveries received, lines picked, pallets released.
 * area narrows it to one of them; without it, every area.
 */
export const listWorkload = async ({ from, to, area = null }) => {
  const params = [from, to];
  if (area) params.push(area);
  const { rows } = await pool.query(
    `SELECT area, EXTRACT(ISODOW FROM at)::int AS weekday, EXTRACT(HOUR FROM at)::int AS hour, COUNT(*)::int AS events
       FROM ${WORK_SQL} work
      WHERE at::date BETWEEN $1::date AND $2::date
        ${area ? 'AND area = $3' : ''}
      GROUP BY area, weekday, hour
      ORDER BY area, weekday, hour`,
    params,
  );
  return rows;
};

export default { listWorkload, WORK_SQL };
