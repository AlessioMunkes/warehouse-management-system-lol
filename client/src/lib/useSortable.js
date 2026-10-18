// ─────────────────────────────────────────────────────────────
// client/src/lib/useSortable.js
//
// Click a column name to sort by it, again to flip the order, and a
// third time to go back to the order the page opened in.
// For the hand-built tables (Feed the Soil, volunteer events, the stock
// ledger) — MasterDataTable has its own, and this behaves the same way.
//
// `accessors` maps a column key to (row) => the value to sort by.
// Empty values always go last, whichever way round, so a column of
// dates does not open on a block of dashes.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';

const blank = (v) => v === null || v === undefined || v === '';

export const compareValues = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
};

export const sortRows = (rows, accessor, dir) => {
  const withValue = rows.map((row, i) => ({ row, i, v: accessor(row) }));
  withValue.sort((x, y) => {
    if (blank(x.v) && blank(y.v)) return x.i - y.i;
    if (blank(x.v)) return 1;
    if (blank(y.v)) return -1;
    const c = compareValues(x.v, y.v);
    return (dir === 'desc' ? -c : c) || x.i - y.i;
  });
  return withValue.map((x) => x.row);
};

export default function useSortable(rows, accessors, initial = null) {
  // { key, dir } or null for the order the rows came in.
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    const accessor = sort && accessors[sort.key];
    return accessor ? sortRows(list, accessor, sort.dir) : list;
  }, [rows, sort, accessors]);

  const toggle = (key) => setSort((prev) => {
    if (prev?.key !== key) return { key, dir: 'asc' };
    if (prev.dir === 'asc') return { key, dir: 'desc' };
    return initial;                       // third click: as it first was
  });

  return { rows: sorted, sort, setSort, toggle };
}
