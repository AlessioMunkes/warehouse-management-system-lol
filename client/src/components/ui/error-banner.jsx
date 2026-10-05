// ─────────────────────────────────────────────────────────────
// client/src/components/ui/error-banner.jsx
//
// A load or save that failed, said above the content it is about, with
// a way to try again when there is one. One shape for every manager and
// admin screen (each used to carry its own copy).
//
//   message — what went wrong, in the server's words or the page's
//   onRetry — shows "Try again" when given
// ─────────────────────────────────────────────────────────────
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ErrorBanner({ message, onRetry, className }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <span className="flex items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
        {message}
      </span>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
      ) : null}
    </div>
  );
}
