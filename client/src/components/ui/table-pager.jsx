// ─────────────────────────────────────────────────────────────
// client/src/components/ui/table-pager.jsx
//
// Previous / "16–30 of 42" / Next under a table on the manager and
// admin screens. The office-screen twin of the staff shell's Paged:
// same numbers from usePaged, drawn with this app's Button.
//
// `hasMore` is for a list that loads in batches from the server (the
// stock ledger): Next stays live on the last loaded page and fetches
// the next batch instead of stopping.
//
// `alwaysShow` keeps the bar on a single page: inside a ListCard it is
// the card's footer, and "1–11 of 11 products" is the count of what
// the tab and filters left, worth showing even with nowhere to page.
// ─────────────────────────────────────────────────────────────
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TablePager({
  page, pages, from, to, total, prev, next, noun = 'records', hasMore = false, loading = false, className = '',
  alwaysShow = false,
}) {
  // One page and nothing more to load: no control, not two dead buttons
  // — unless the bar is a card's footer (alwaysShow).
  if (pages <= 1 && !hasMore && !(alwaysShow && total > 0)) return null;

  const atEnd = page >= pages;
  return (
    <nav aria-label={`${noun} pages`} className={`flex items-center justify-between gap-3 px-1 py-3 ${className}`}>
      <Button type="button" variant="outline" size="sm" onClick={prev} disabled={page <= 1}>
        <ChevronLeft /> Previous
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {from}–{to} of {total}{hasMore ? '+' : ''} {noun}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={next} disabled={(atEnd && !hasMore) || loading}>
        {loading ? 'Loading…' : <>Next <ChevronRight /></>}
      </Button>
    </nav>
  );
}
