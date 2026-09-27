// ─────────────────────────────────────────────────────────────
// client/src/components/ui/sortable-head.jsx
//
// A table header you can click to sort by: an arrow shows the current
// order, a faint double arrow says the column can be sorted. Same look
// as MasterDataTable's headers. `aria-sort` tells a screen reader
// which way the column is sorted.
// ─────────────────────────────────────────────────────────────
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';

export default function SortableHead({ label, sortKey, sort, onSort, align = 'left', className = '' }) {
  const active = sort?.key === sortKey;
  const right = align === 'right';
  const centre = align === 'center';
  return (
    <TableHead
      className={`${right ? 'text-right' : centre ? 'text-center' : ''} ${className}`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSort(sortKey); }}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${right ? 'flex-row-reverse' : ''}`}
      >
        <span>{label}</span>
        {active
          ? (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ArrowUp className="h-3 w-3 shrink-0" />)
          : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />}
      </button>
    </TableHead>
  );
}
