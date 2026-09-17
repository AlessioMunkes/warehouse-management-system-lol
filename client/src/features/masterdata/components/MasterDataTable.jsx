// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/components/MasterDataTable.jsx
//
// The header row and the body, driven by whatever useTableView says is
// visible. Products, Suppliers, Users and the guest log all render
// through this, so the sort arrows, the click-to-open row and the
// empty state behave the same everywhere and only have to be got right
// once.
//
// THE TABLE NEVER SCROLLS SIDEWAYS.
// It used to. The shadcn table primitives set `whitespace-nowrap` on
// every head and cell, so one long value decided the width of the
// whole column: a generated product name like
// "Access Check Resolved access-check-1787871216023" took 393px of a
// 992px card on its own, the table came out 1037px wide, and the last
// column sat off the edge behind a scrollbar nobody had a reason to
// look for. Columns you cannot see are columns that do not exist.
//
// Two changes fix it together, and neither works alone:
//
//   table-fixed + <colgroup>   Column widths come from the weights
//     below rather than from the content, so the table is exactly as
//     wide as its container at every viewport — there is no width for
//     it to overflow to. Auto layout would go back to measuring the
//     longest cell the moment somebody adds a longer name.
//
//   whitespace-normal + break-words   With fixed widths, nowrap would
//     just clip instead of scrolling, which is worse. Wrapping lets a
//     long value use a second line, and break-words handles the case
//     the warehouse actually produces: 30-character SKUs and generated
//     names with no spaces to break at.
//
// WEIGHTS, NOT PERCENTAGES.
// Each column declares a weight and the share is worked out from the
// columns currently VISIBLE. Percentages hard-coded per column would
// stop summing to 100 the moment somebody hid one in the Columns
// control, and the table would either leave a gap or overflow again.
// A column with no weight counts as 1.
//
// align-top, because a wrapped two-line name next to a one-line SKU
// reads as a row when they share a top edge and as two rows when they
// are both centred.
// ─────────────────────────────────────────────────────────────
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

export default function MasterDataTable({
  columns,        // the VISIBLE columns, from useTableView
  rows,
  sort,
  onToggleSort,
  onOpenRow,
  rowKey = (row) => row.id,
  // Extra attributes per row — the purchase-order list uses it to keep
  // its selected-row highlight. A function rather than a prop per
  // attribute, so a caller that needs something else does not have to
  // come back here for it.
  rowAttrs,
}) {
  const totalWeight = columns.reduce((sum, c) => sum + (c.weight ?? 1), 0) || 1;

  return (
    <Table className="w-full table-fixed">
      <colgroup>
        {columns.map((col) => (
          <col
            key={col.key}
            style={{ width: `${((col.weight ?? 1) / totalWeight * 100).toFixed(3)}%` }}
          />
        ))}
      </colgroup>

      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key} className="align-bottom">
              {col.sort ? (
                // stopPropagation: without it, sorting by SKU also
                // opened whichever row happened to be underneath the
                // header when the list re-ordered.
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleSort(col.key); }}
                  aria-label={`Sort by ${col.label}`}
                  className="flex w-full min-w-0 items-center gap-1 text-left hover:text-foreground"
                >
                  {/* Headers truncate; they never wrap and never break
                      mid-word. Letting break-words loose on them turned
                      "Perishable" into "Perisha / ble" and "Unit" into
                      "Uni / t" whenever a column came out a few pixels
                      short — and which labels break depends on the font,
                      so tuning the weights until it looks right is a fix
                      that quietly comes undone. An ellipsis is stable at
                      any width, and the sort arrow stays put because it
                      is shrink-0 outside this span. */}
                  <span className="min-w-0 truncate">{col.label}</span>
                  {sort?.key === col.key
                    ? (sort.direction === 'desc'
                        ? <ArrowDown className="h-3 w-3 shrink-0" />
                        : <ArrowUp className="h-3 w-3 shrink-0" />)
                    : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />}
                </button>
              ) : col.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={rowKey(row)}
            className="cursor-pointer"
            onClick={() => onOpenRow(row)}
            {...(rowAttrs ? rowAttrs(row) : null)}
          >
            {columns.map((col) => (
              <TableCell
                key={col.key}
                className={`align-top whitespace-normal break-words ${col.cellClass ?? 'text-muted-foreground'}`}
              >
                {col.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
