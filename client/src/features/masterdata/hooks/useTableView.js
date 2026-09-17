// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/hooks/useTableView.js
//
// Sorting and column visibility for the master-data tables, written
// once instead of four times.
//
// UserDirectoryPage already had the sorting — three-state, first click
// descending, the same shape StockManifestTable uses. Copying that into
// Products and Suppliers would have made three places where the rule
// lives and two of them eventually wrong, which is the exact drift
// utils/validation.js was written to stop. So the rule moves here and
// all four read it.
//
// COLUMN VISIBILITY IS PER PERSON, PER SCREEN, AND STAYS PUT
// Somebody who hides four columns on the product catalogue means it
// today and tomorrow, so the choice is written to localStorage under a
// key naming the screen. It is a view preference on one device, not
// data: it never reaches the server, and losing it costs one click.
// Every read and write is wrapped, because storage throws outright in
// a private window rather than returning null.
//
// HIDDEN, NOT VISIBLE, IS WHAT GETS STORED
// Storing the visible set means a column added in a later release is
// invisible to everyone who ever touched this control, and nobody
// would connect the two. Storing the hidden set makes a new column
// show up for everybody, which is the behaviour that can be reasoned
// about from the outside.
//
// AND SOME COLUMNS DROP THEMSELVES ON A NARROW SCREEN
// A column declares `minWidth: 'md'` to mean "not worth showing below
// this". Seven columns at 368px is 50px each — every value wraps to
// four lines and the table is unreadable whether or not it technically
// fits. The alternative was leaving the phone to scroll sideways, and
// a column you have to go looking for is one you will not find.
//
// This is measured against the window, not a CSS media query, because
// the same fact has to reach the Columns control: a column the layout
// has dropped must not appear there as a ticked box that changes
// nothing.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';

const keyFor = (table) => `wms_cols_${table}`;

// Tailwind's own breakpoints, so a column that appears at 'md' appears
// at the same width as everything else on the page that says md:.
const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 };

const readHidden = (table) => {
  try {
    const raw = localStorage.getItem(keyFor(table));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
};

export default function useTableView(table, columns) {
  const [sort, setSort] = useState(null);            // { key, direction } | null
  const [hidden, setHidden] = useState(() => readHidden(table));

  // Rendered server-side or in a test harness without a window: assume
  // wide, so nothing is silently dropped from a snapshot.
  const [viewport, setViewport] = useState(
    () => (typeof window === 'undefined' ? 1280 : window.innerWidth),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', onResize);
    // Read once on mount as well: the first value was taken during the
    // initial render, and an orientation change or a restored window
    // between then and now would leave it stale.
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Three-state, same as StockManifestTable: first click descending,
  // second ascending, third back to whatever order the server sent —
  // which on all of these screens is deliberate (inactive last, then
  // name), so "no sort" is a real answer, not an absence.
  const toggleSort = useCallback((key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: 'asc' };
      return null;
    });
  }, []);

  const persist = useCallback((next) => {
    setHidden(next);
    try { localStorage.setItem(keyFor(table), JSON.stringify(next)); } catch { /* no storage */ }
  }, [table]);

  const toggleColumn = useCallback((key) => {
    persist(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  }, [hidden, persist]);

  const resetColumns = useCallback(() => persist([]), [persist]);

  // Columns wide enough to be worth rendering at this viewport. The
  // Columns control reads this too, so it only ever offers columns it
  // can actually turn on.
  const availableColumns = useMemo(
    () => columns.filter((c) => !c.minWidth || viewport >= (BREAKPOINTS[c.minWidth] ?? 0)),
    [columns, viewport],
  );

  // alwaysOn columns cannot be hidden by the control. A table whose
  // every column is switched off is a stack of empty rows you cannot
  // click your way out of, and the name column is what identifies the
  // row anyway.
  const visibleColumns = useMemo(
    () => availableColumns.filter((c) => c.alwaysOn || !hidden.includes(c.key)),
    [availableColumns, hidden],
  );

  // Sorts a copy. Mutating the array the page holds in state means
  // React sees the same reference and the table does not re-render.
  //
  // localeCompare with 'en-ZA' for text; a numeric comparator is used
  // when the column declares numeric: true, because "10" sorts before
  // "9" as text and a lead time of ten days is not shorter than nine.
  const sortRows = useCallback((rows) => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sort) return rows;

    const factor = sort.direction === 'desc' ? -1 : 1;

    if (column.numeric) {
      return [...rows].sort((a, b) => {
        const av = column.sort(a);
        const bv = column.sort(b);
        // Rows with nothing recorded sort last in both directions.
        // Flipping the order should not promote "not known" to the top.
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * factor;
      });
    }

    return [...rows].sort(
      (a, b) => String(column.sort(a)).localeCompare(String(column.sort(b)), 'en-ZA') * factor,
    );
  }, [sort, columns]);

  return {
    sort, toggleSort,
    hidden, toggleColumn, resetColumns,
    availableColumns, visibleColumns,
    sortRows,
  };
}
