// ─────────────────────────────────────────────────────────────
// client/src/components/ui/status-badge.jsx
//
// One status pill for every list in the manager and admin screens.
//
//   tone    — the colour, by what the status asks of the reader:
//             good (green) · warn (amber) · bad (red) · info (blue) ·
//             neutral (grey)
//   strong  — a solid fill instead of a soft tint, to tell apart two
//             statuses with the same meaning
//   icon    — the status's own picture
//
// Pass `kind` and `status` to take all three from lib/statusStyles.js,
// which is where every list's statuses are defined so none collide.
// Built on the theme's status tokens, so it holds contrast in light
// and dark; the label always says the status in words.
// ─────────────────────────────────────────────────────────────
import { cn } from '@/lib/utils';
import { statusStyle } from '@/lib/statusStyles';

const SOFT = {
  good:    'bg-good-soft text-good border-good/30',
  warn:    'bg-warn-soft text-warn border-warn/30',
  bad:     'bg-danger-soft text-danger border-danger/30',
  info:    'bg-info-soft text-info border-info/30',
  neutral: 'bg-muted text-muted-foreground border-transparent',
};

// Solid: the ink colour as the fill, the page background as the text —
// white on the dark ink in light mode, dark on the lighter ink in dark
// mode, so it stays readable in both.
const STRONG = {
  good:    'bg-good text-background border-good',
  warn:    'bg-warn text-background border-warn',
  bad:     'bg-danger text-background border-danger',
  info:    'bg-info text-background border-info',
  neutral: 'bg-muted-foreground text-background border-muted-foreground',
};

export default function StatusBadge({ kind, status, tone, strong, icon, className, children }) {
  const fromKind = kind ? statusStyle(kind, status) : null;
  const t = tone ?? fromKind?.tone ?? 'neutral';
  const solid = strong ?? fromKind?.strong ?? false;
  const Icon = icon ?? fromKind?.icon ?? null;
  const palette = solid ? STRONG : SOFT;

  return (
    <span
      data-tone={t}
      data-strong={solid ? '' : undefined}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        palette[t] ?? palette.neutral,
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3 shrink-0" /> : null}
      {children}
    </span>
  );
}
