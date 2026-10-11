// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ChartNote.jsx
//
// What a chart's figures count, behind an info button beside its
// title instead of a paragraph under it. Opens on hover, on a tap and
// from the keyboard, one short line per point.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { noteLines } from './chartFormat';

export default function ChartNote({ note, label = 'About these figures' }) {
  const [open, setOpen] = useState(false);
  const lines = noteLines(note);
  if (lines.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 rounded-xl p-3 text-xs">
        <p className="font-semibold">{label}</p>
        <ul className="space-y-1.5 text-muted-foreground">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
