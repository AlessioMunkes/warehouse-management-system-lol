// ─────────────────────────────────────────────────────────────
// client/src/components/ui/list-card.jsx
//
// The card a manager list lives in: the toolbar (or the bulk-action bar
// while rows are ticked) across the top, the table, and the pager
// along the bottom — one container, so the controls sit with the rows
// they act on.
//
//   header   — ListToolbar or BulkActionBar
//   footer   — TablePager
//   children — the Table, an EmptyState, or skeleton rows
// ─────────────────────────────────────────────────────────────
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function ListCard({ header, footer, children, className }) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      {header ? <div className="border-b px-4 py-3 sm:px-5">{header}</div> : null}
      {/* A table's first and last columns line up with the toolbar
          above them (px-4 / sm:px-5), whatever table it is. */}
      <div className="[&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4 sm:[&_tr>*:first-child]:pl-5 sm:[&_tr>*:last-child]:pr-5">
        {children}
      </div>
      {footer ? <div className="border-t px-4 sm:px-5">{footer}</div> : null}
    </Card>
  );
}
