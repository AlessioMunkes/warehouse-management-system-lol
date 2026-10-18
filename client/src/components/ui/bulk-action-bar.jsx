// ─────────────────────────────────────────────────────────────
// client/src/components/ui/bulk-action-bar.jsx
//
// What replaces a list's toolbar while rows are ticked: how many are
// selected, what can be done to all of them, and a way out.
//
//   count    — rows ticked; the bar renders nothing at zero
//   noun     — plural noun for the count ("products")
//   onClear  — untick everything
//   children — the action Buttons
//
// Same height as ListToolbar's row (min-h-10) so the table does not
// jump when the first box is ticked. The count is a polite live region: a screen reader
// hears "3 products selected" without losing its place in the table.
// ─────────────────────────────────────────────────────────────
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BulkActionBar({ count, noun = 'rows', onClear, children }) {
  if (!count) return null;

  return (
    <div
      role="toolbar"
      aria-label={`Actions for selected ${noun}`}
      className="flex min-h-10 flex-wrap items-center gap-2 rounded-full border bg-muted/60 py-0.5 pl-4 pr-1"
    >
      <span className="text-sm font-medium tabular-nums" aria-live="polite">
        {count} {count === 1 ? noun.replace(/s$/, '') : noun} selected
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        <X />
        Clear selection
      </Button>
    </div>
  );
}
