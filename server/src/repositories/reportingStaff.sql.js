// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingStaff.sql.js
//
// "By staff member": who did the work, as a report breakdown and a filter.
//
// Each report names the column on its own table that records the person
// (delivery_notes.received_by, picking_slip_items.confirmed_by,
// dispatch_events.dispatched_by, and so on), and these turn it into the
// person's full name and a staff_id filter. A row from before anyone was
// recorded reads "Not recorded", so the bars still add up to the total.
//
// idCol is always a column name written in the repository, never a value
// from the request; the staff id itself is bound as a parameter.
// ─────────────────────────────────────────────────────────────

export const NOT_RECORDED = 'Not recorded';

/** The person's full name, for SELECT and GROUP BY alike. */
export const staffName = (idCol) =>
  `COALESCE((SELECT NULLIF(TRIM(su.first_name || ' ' || COALESCE(su.last_name, '')), '') FROM users su WHERE su.id = ${idCol}), '${NOT_RECORDED}')`;

/** The WHERE clause for one person, or nothing when no staff_id is set. */
export const staffFilter = (idCol, filters, params) => {
  if (!filters?.staff_id) return [];
  params.push(filters.staff_id);
  return [`${idCol} = $${params.length}`];
};

export default { staffName, staffFilter, NOT_RECORDED };
