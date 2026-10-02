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
    // Side by side from sm up, the words taking what the actions leave,
    // so a long description wraps beside the buttons rather than pushing
    // them onto a line of their own.
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-medium">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// The page body's width and padding, the same on every screen.
export function PageShell({ children, width = 'max-w-6xl', className }) {
  return <main className={cn('mx-auto w-full px-4 py-6', width, className)}>{children}</main>;
}
