// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/components/ReceiptsTable.jsx
//
// The table on the Receipts page, for either tab: the page hands it
// the columns for goods in or goods out. Sorting and paging happen on
// the server, so a header click asks the page to refetch.
//
// Lives inside the page's ListCard: loading is skeleton rows, nothing
// to show is an EmptyState, and a failed load is said in place.
// ─────────────────────────────────────────────────────────────
import { ChevronRight, FileSearch } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import SortableHead from '@/components/ui/sortable-head';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';

const EDGE = 'first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5';

export default function ReceiptsTable({
  columns, rows, rowKey, onOpen, isLoading, emptyMessage, emptyAction, error,
  sort, dir, onSortChange,
}) {
  if (error) {
    return <div className="p-4"><ErrorBanner message={`Could not load records. ${error}`} /></div>;
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading records">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!rows.length) {
    return <EmptyState icon={FileSearch} title="No records" description={emptyMessage} action={emptyAction} />;
  }

  // A new column opens newest-first; the same column again flips it.
  const handleSort = (key) => {
    if (!key || !onSortChange) return;
    onSortChange(key, sort === key && dir === 'desc' ? 'asc' : 'desc');
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (c.sortKey ? (
            <SortableHead
              key={c.key}
              label={c.header}
              sortKey={c.sortKey}
              sort={{ key: sort, dir }}
              onSort={handleSort}
              align={c.align}
              className={EDGE}
            />
          ) : (
            <TableHead key={c.key} className={`${EDGE} ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</TableHead>
          )))}
          <TableHead className={`w-px ${EDGE}`}><span className="sr-only">Open</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)} className="cursor-pointer" onClick={() => onOpen(row)}>
            {columns.map((c) => (
              <TableCell key={c.key} className={`${EDGE} ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.render(row)}
              </TableCell>
            ))}
            <TableCell className={`text-right text-muted-foreground ${EDGE}`}>
              <ChevronRight aria-hidden="true" className="ml-auto size-4" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
