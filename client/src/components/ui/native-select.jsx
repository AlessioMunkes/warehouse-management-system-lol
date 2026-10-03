// ─────────────────────────────────────────────────────────────
// client/src/components/ui/native-select.jsx
//
// A browser <select> drawn like this app's Input: the same pill, fill
// and focus ring, with the app's own chevron in place of the system
// arrow. For toolbars and short forms, where a real <select> is what
// is wanted (it works with the keyboard and on a phone for free) but
// the browser's default box looked like it came from another program.
//
//   size — 'default' (h-9, forms) or 'sm' (h-8, toolbars)
// Everything else is passed to the <select>; `className` sizes the
// wrapper (e.g. "w-44").
// ─────────────────────────────────────────────────────────────
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NativeSelect({ className, size = 'default', children, ...props }) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        className={cn(
          'w-full min-w-0 appearance-none rounded-3xl border border-transparent bg-input/50 pl-3 pr-8 text-sm outline-none',
          'transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-8' : 'h-9',
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}
