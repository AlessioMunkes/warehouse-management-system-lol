// ─────────────────────────────────────────────────────────────
// server/src/constants/receiptSort.js
//
// Allowed sort columns for the receipts archive.
//
// A sort key arrives from the client and ends up inside an ORDER BY,
// where it CANNOT be parameterised — $1 binds values, not
// identifiers. So the only safe construction is this: a fixed map
// from a key the client may send to a SQL fragment written here.
// The repository looks the key up and uses the fragment; it never
// sees the client's string. Anything absent from the map is a 400.
//
// If a new sortable column is wanted, add it HERE. Do not be tempted
// to relax the lookup into string building, however well validated
// the input looks upstream.
//
// Each entry carries its own tiebreak so paging is stable: without
// one, two notes on the same date can swap places between page 1 and
// page 2 and a row is silently skipped or repeated. The primary key
// is the tiebreak in both cases because it is unique and indexed.
// ─────────────────────────────────────────────────────────────

// Goods in — delivery notes.
export const DELIVERY_SORTS = {
  id:                'dn.id',
  delivery_date:     'dn.delivery_date',
  supplier_name:     's.name',
  po_number:         'po.po_number',
  received_by_name:  'u.first_name',
  status:            'dn.status',
  discrepancy_count: 'COALESCE(d.discrepancy_count, 0)',
};

// Goods out — dispatch notes.
export const DISPATCH_SORTS = {
  id:             'de.id',
  dispatch_date:  'ps.dispatch_date',
  collected_at:   'COALESCE(de.collected_at, de.flagged_at)',
  ecd_name:       'COALESCE(e.name, ps.beneficiary_name)',
  cohort:         'ps.cohort',
  driver_name:    'de.driver_name',
  status:         'de.status',
  variance_count: 'COALESCE(l.variance_count, 0)',
};

export const SORT_DIRECTIONS = ['asc', 'desc'];

// NULLS LAST on descending keeps empty values out of the way. A note with no
// driver recorded is not "the highest driver name", and putting a run of
// blanks at the top of a descending sort makes the control feel broken.
export const buildOrderBy = (map, sort, dir, fallbackKey, tiebreak) => {
  const column    = map[sort] || map[fallbackKey];
  const direction = dir === 'asc' ? 'ASC' : 'DESC';
  const nulls     = direction === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';
  return `${column} ${direction} ${nulls}, ${tiebreak} ${direction}`;
};

export default { DELIVERY_SORTS, DISPATCH_SORTS, SORT_DIRECTIONS, buildOrderBy };
