// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ReportBrowser.jsx
//
// "Browse all reports": every operational report, grouped by the
// part of the warehouse it covers, each with the one-line
// description the catalog already carries. One tap runs it.
//
// This is the answer to "what can I even ask?" — and it works with
// the AI switched off, because it only reads the catalog.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { groupByArea } from '../operationalQuestions';

const MUTED = 'var(--ink-soft)';

// The catalog's description doubles as the AI grounding text, so it
// can run long. The first sentence is enough to choose by.
const firstSentence = (s) => {
  const m = /^(.+?[.!?])(\s|$)/.exec(s ?? '');
  return m ? m[1] : s;
};

export default function ReportBrowser({ metrics, onPick, comparisons = [], onPickComparison, disabled }) {
  const [open, setOpen] = useState(false);
  const groups = groupByArea(metrics);

  return (
    <div className="rounded-[4px] border-2 border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left text-sm font-medium sm:px-5"
      >
        <span>
          Browse all reports
          <span className="ml-2 text-xs font-normal" style={{ color: MUTED }}>
            {metrics.length} reports in {groups.length} areas{comparisons.length ? `, ${comparisons.length} comparisons` : ''}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-5 border-t-2 border-line p-4 sm:grid-cols-2 sm:px-5">
          {groups.map((g) => (
            <section key={g.id}>
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{g.label}</h3>
              <ul className="mt-2 space-y-1">
                {g.items.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(m.id)}
                      className="w-full rounded-[4px] px-2 py-1.5 text-left hover:bg-ink/5 disabled:opacity-50"
                    >
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-xs" style={{ color: MUTED }}>{firstSentence(m.description)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {comparisons.length > 0 && onPickComparison && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Comparisons (scatter plots)</h3>
              <ul className="mt-2 space-y-1">
                {comparisons.map((c) => (
                  <li key={c.id}>
                    <button type="button" disabled={disabled} onClick={() => onPickComparison(c.id)}
                      className="w-full rounded-[4px] px-2 py-1.5 text-left hover:bg-ink/5 disabled:opacity-50">
                      <span className="block text-sm font-medium">{c.label}</span>
                      <span className="block text-xs" style={{ color: MUTED }}>{firstSentence(c.description)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
