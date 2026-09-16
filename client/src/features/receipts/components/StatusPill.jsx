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

const TONE = {
  neutral: 'bg-line text-ink',
  good:    'bg-ink text-on-ink',
  warn:    'bg-danger-soft text-brand border-brand',
  muted:   'bg-surface text-ink-soft border-line',
};

export default function StatusPill({ tone = 'neutral', children }) {
  return (
    <Badge className={`rounded-[4px] border-2 border-transparent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONE[tone] || TONE.neutral}`}>
      {children}
    </Badge>
  );
}
