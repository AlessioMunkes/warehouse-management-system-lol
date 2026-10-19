// ─────────────────────────────────────────────────────────────
// server/src/repositories/impactMap.repository.js
//
// The SQL behind the manager's Impact map: every centre with its pin
// and what reached it in a period, in one query.
//
// THE SAME DEFINITIONS AS THE REPORTS, imported rather than copied, so
// the map cannot disagree with "Meals enabled" or "Dispatch volume":
//
//   a collection   a dispatch event marked collected or late_collected
//                  (COLLECTED_STATUSES)
//   its day        the SAST day it was collected, or the slip's booked
//                  day for an old row with no collection time (LEFT_DAY)
//   kilograms      the gate's loaded quantity on kilogram lines only;
//                  crates and items are not added to kilograms
//   which slips    the impact beneficiary kinds (IMPACT_BENEFICIARY_KINDS)
//
// Meals are kilograms times the kg_to_meals factor, applied in the
// service exactly as reporting.service.js does for Meals enabled.
//
// A centre's last collection is its newest one ever, not only inside
// the period: "not served for 40 days" is what the map is for.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { LEFT_DAY } from './reporting.repository.js';
import { COLLECTED_STATUSES, IMPACT_BENEFICIARY_KINDS } from '../features/reporting/reportCatalog.js';

/**
 * Every active centre, and any inactive one that was served in the
 * period, with its dispatches, kilograms and last collection.
 */
const listCentreImpact = async ({ from, to }) => {
  const { rows } = await pool.query(
    `WITH served AS (
       SELECT ps.ecd_id,
              COUNT(DISTINCT de.id)::int AS dispatches,
              COALESCE(SUM(del.loaded_quantity) FILTER (WHERE del.unit = 'kg'), 0)::numeric AS kg
         FROM picking_slips ps
         JOIN dispatch_events de ON de.picking_slip_id = ps.id
         LEFT JOIN dispatch_event_lines del ON del.dispatch_event_id = de.id
        WHERE ps.ecd_id IS NOT NULL
          AND ${LEFT_DAY} BETWEEN $1::date AND $2::date
          AND de.status = ANY($3::text[])
          AND ps.beneficiary_kind = ANY($4::beneficiary_type[])
        GROUP BY ps.ecd_id
     ), last_collection AS (
       SELECT ps.ecd_id, MAX(${LEFT_DAY})::text AS last_collected
         FROM picking_slips ps
         JOIN dispatch_events de ON de.picking_slip_id = ps.id
        WHERE ps.ecd_id IS NOT NULL
          AND de.status = ANY($3::text[])
          AND ps.beneficiary_kind = ANY($4::beneficiary_type[])
        GROUP BY ps.ecd_id
     )
     SELECT e.id, e.name, e.cohort::text AS cohort, e.child_count, e.is_active,
            e.suburb, e.latitude, e.longitude,
            COALESCE(s.dispatches, 0) AS dispatches,
            COALESCE(s.kg, 0) AS kg,
            l.last_collected
       FROM ecd_centres e
       LEFT JOIN served s ON s.ecd_id = e.id
       LEFT JOIN last_collection l ON l.ecd_id = e.id
      WHERE e.is_active OR s.ecd_id IS NOT NULL
      ORDER BY e.name ASC`,
    [from, to, COLLECTED_STATUSES, IMPACT_BENEFICIARY_KINDS]
  );
  return rows;
};

export default { listCentreImpact };
