// ─────────────────────────────────────────────────────────────
// client/src/components/ui/page-header.jsx
//
// The top of every manager and admin screen: the title, one line of
// what the screen is for, and the screen's main action on the right.
// The Feed the Soil treatment (text-2xl medium, muted line under it),
// so every page opens the same way.
//
//   title       — the page's name, as the menu calls it
//   description — one sentence; optional
//   actions     — Buttons, right-aligned (wrap under on a phone)
// ─────────────────────────────────────────────────────────────
import { cn } from '@/lib/utils';

export default function PageHeader({ title, description, actions, className }) {
  return (
    // Side by side when there is room for both, the words taking what the
    // actions leave. When there is not (a narrow window, or a record open
    // beside the list), the actions drop under the title instead of
    // squeezing it into a column the buttons then sit on top of. Room is
    // judged by the header itself (flex-wrap and a minimum for the title),
    // not the window: the window can be wide while the page is not.
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-[min(100%,18rem)] flex-1">
        <h1 className="text-2xl font-medium">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// The page body's width and padding, the same on every screen.
export function PageShell({ children, width = 'max-w-6xl', className }) {
  return <main className={cn('mx-auto w-full px-4 py-6', width, className)}>{children}</main>;
}
