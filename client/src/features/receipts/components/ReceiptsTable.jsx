// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/components/ReceiptsTable.jsx
//
// The archive list, built on the shadcn table primitives in
// components/ui/table.jsx.
//
// ── SORTING IS SERVER-SIDE ───────────────────────────────────
// A column with `sortKey` renders its header as a button that asks
// the PAGE to re-fetch, not this component to reorder anything.
// The list is paged at 25, so sorting the rows already in state
// would sort the current page only — click "Delivered" on page one
// and you get the oldest of those 25, not the oldest in the archive.
// It would look correct, which is the worst kind of wrong.
//
// First click on a column sorts DESCENDING — newest date, highest
// count, Z to A. Clicking the active column flips direction.
//
// aria-sort is set on the active header so a screen reader announces
// the order; the arrow alone says nothing to anyone not looking at it.
// ─────────────────────────────────────────────────────────────
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const SortArrow = ({ active, dir }) => (
  <span
    aria-hidden="true"
    className={`ml-1 inline-block text-[9px] leading-none ${active ? 'text-[#ef3a40]' : 'text-[#b9b3ac]'}`}
  >
    {active ? (dir === 'asc' ? '▲' : '▼') : '▼'}
  </span>
);

export default function ReceiptsTable({
  columns, rows, rowKey, onOpen, isLoading, emptyMessage, error,
  sort, dir, onSortChange,
}) {
  if (error) {
    return (
      <div className="rounded-[4px] border-2 border-[#ef3a40] bg-[#fdf1f1] p-6 text-center">
        <p className="text-sm font-bold text-[#2b3336]">Could not load records</p>
        <p className="mt-1 text-sm text-[#676767]">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-[4px] border-2 border-[#e9e3dd] bg-white p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-[#676767]">
          Loading records…
        </p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-[4px] border-2 border-[#e9e3dd] bg-white p-10 text-center">
        <p className="text-sm text-[#676767]">{emptyMessage}</p>
      </div>
    );
  }

  const handleSort = (key) => {
    if (!key || !onSortChange) return;
    // Same column flips direction; a new column starts descending.
    onSortChange(key, sort === key && dir === 'desc' ? 'asc' : 'desc');
  };

  return (
    <div className="rounded-[4px] border-2 border-[#e9e3dd] bg-white">
      <Table>
        <TableHeader>
          <TableRow className="border-[#e9e3dd]">
            {columns.map((c) => {
              const active = c.sortKey && sort === c.sortKey;
              return (
                <TableHead
                  key={c.key}
                  aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`p-0 text-[10px] font-bold uppercase tracking-wider ${
                    c.align === 'right' ? 'text-right' : ''
                  } ${active ? 'text-[#2b3336]' : 'text-[#676767]'}`}
                >
                  {c.sortKey ? (
                    <button
                      type="button"
                      onClick={() => handleSort(c.sortKey)}
                      className={`flex h-12 w-full items-center px-3 text-[10px] font-bold uppercase tracking-wider hover:text-[#2b3336] ${
                        c.align === 'right' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {c.header}
                      <SortArrow active={active} dir={dir} />
                    </button>
                  ) : (
                    <span className="flex h-12 items-center px-3">{c.header}</span>
                  )}
                </TableHead>
              );
            })}
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              className="cursor-pointer border-[#e9e3dd] hover:bg-[#faf8f6]"
              onClick={() => onOpen(row)}
            >
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={`text-sm text-[#2b3336] ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.render(row)}
                </TableCell>
              ))}
              <TableCell className="text-right">
                <span
                  className="rounded-[4px] border-2 border-[#2b3336] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#2b3336]"
                  aria-hidden="true"
                >
                  View
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
