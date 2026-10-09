// ───────────────────────────────────────────────────────
// client/src/features/staff/usePaged.js
//
// The state behind the pager. In its own file because this project
// treats react-refresh/only-export-components as an ERROR, not a
// warning: a module that exports a component AND a hook breaks fast
// refresh, so it gets split. Same reason shellContext.js and
// toastContext.js exist.
//
// Client-side paging on purpose. These endpoints already return the
// whole working set — a day's pallets, a week's records — and it is
// small. Server paging is worth doing for the stock ledger, which
// grows forever; it is not worth a round trip for nine rows.
//
// A page size of eight keeps a list roughly one screen tall on a
// bench tablet, which is what makes "3 of 9 collected" a fact you can
// act on rather than a number above a scroll.
// ──────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 8;

// Returns the current slice plus everything the control needs, so a
// caller renders <Paged {...paged} /> under its own list and nothing
// else about that list changes.
// The office screens' tables page at fifteen: a desk screen holds
// more than a bench tablet, and fifteen rows is still one screen.
export const TABLE_PAGE_SIZE = 15;

// `resetKey`: when it changes (a new filter, a new sort), go back to
// page one. Page 3 of a re-sorted list is a different set of rows,
// and staying there reads as the filter having lost things.
export default function usePaged(items, pageSize = DEFAULT_PAGE_SIZE, resetKey = undefined) {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setPage(1);
  }
  const list  = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const current = Math.min(page, pages);
  const start   = (current - 1) * pageSize;
  const slice   = list.slice(start, start + pageSize);
  const setClampedPage = useCallback((nextPage) => {
    setPage((previous) => {
      const raw = typeof nextPage === 'function' ? nextPage(previous) : nextPage;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return previous;
      return Math.min(pages, Math.max(1, Math.trunc(parsed)));
    });
  }, [pages]);

  return {
    slice,
    page: current,
    pages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    setPage: setClampedPage,
    next: () => setClampedPage((p) => p + 1),
    prev: () => setClampedPage((p) => p - 1),
  };
}
