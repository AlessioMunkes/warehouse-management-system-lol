// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/components/StatusPill.jsx
//
// Wraps the shadcn Badge rather than inventing a pill, so the archive
// matches the rest of the manager screens.
//
// Colour is never the only signal — the label always reads as words.
// The gate and the manager's desk are both places where a screen gets
// looked at in bright sun on a cheap phone.
// ─────────────────────────────────────────────────────────────
import { Badge } from '@/components/ui/badge';

// Red / amber / green on the theme's status tokens, so a flagged note
// reads as a problem and a clean one as done, at a glance.
const TONE = {
  neutral: 'bg-line text-ink',
  good:    'bg-good-soft text-good border-good/40',
  warn:    'bg-warn-soft text-warn border-warn/40',
  bad:     'bg-danger-soft text-danger border-danger/40',
  info:    'bg-info-soft text-info border-info/40',
  muted:   'bg-surface text-ink-soft border-line',
};

export default function StatusPill({ tone = 'neutral', children }) {
  return (
    <Badge className={`rounded-[4px] border-2 border-transparent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONE[tone] || TONE.neutral}`}>
      {children}
    </Badge>
  );
}
