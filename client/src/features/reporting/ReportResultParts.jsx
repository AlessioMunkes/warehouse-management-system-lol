// ─────────────────────────────────────────────────────────────
// src/features/reporting/ReportResultParts.jsx
//
// Pieces of a report result on the Reporting page that only show what
// they are given: the "Try:" alternatives, the drill and records
// buttons under a chart, the notes in its footer, and a comparison
// card. The report state and the requests stay in ReportingPage.jsx.
// ─────────────────────────────────────────────────────────────
import ComparisonChart from './ComparisonChart';
import { SaveReport } from './SavedReports';
import { formatLabel } from './chartFormat';

export const CHARCOAL = 'var(--ink)';
export const MUTED    = 'var(--ink-soft)';
export const BORDER   = 'var(--line)';

// "Not what you meant? Try:" — the next closest answers the server
// offered with an AI answer. One tap runs that one instead.
export function Alternatives({ items, onPick, closest }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: MUTED }}>
      <span>{closest ? 'Closest match. Or try:' : 'Not what you meant? Try:'}</span>
      {items.map((a) => (
        <button
          key={`${a.kind}:${a.id}`}
          type="button"
          onClick={() => onPick(a)}
          className="rounded-full border px-3 py-1 font-medium text-ink hover:bg-muted/60"
          style={{ borderColor: BORDER }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// Under a drillable chart: open the picked bar another way, or list the
// records a report (or one bar of it) is made of.
export function ReportDrill({ report, highlight, drillBusy, onDrill, onRecords }) {
  return (
    <>
      {report.meta?.drillable && (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          {highlight
            ? (
              // One button per way this bar can be opened: over
              // time, or split by another breakdown the report has.
              <span className="flex flex-wrap items-center gap-1.5">
                <span>{drillBusy ? 'Opening…' : `Drill into ${formatLabel(highlight)}:`}</span>
                {(report.meta.drillOptions ?? [{ id: undefined, label: 'Open' }]).map((o, i) => (
                  <button key={o.id ?? 'open'} type="button" disabled={drillBusy} onClick={() => onDrill(highlight, o.id)}
                    className={`rounded-lg px-2 py-1 font-bold disabled:opacity-50 ${i === 0 ? 'bg-ink text-on-ink' : 'border border-line text-ink hover:bg-muted/60'}`}>
                    {o.label}
                  </button>
                ))}
              </span>
            )
            : 'Click a bar or point to pick it, then drill into the report behind it.'}
        </p>
      )}

      {/* The last level: the rows that were counted. */}
      {report.meta?.records && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: MUTED }}>
          <span>See what this is made of:</span>
          <button type="button" onClick={() => onRecords({ spec: report.spec, label: null })}
            className="rounded-lg border border-line px-2 py-1 font-bold text-ink hover:bg-muted/60">
            All the records
          </button>
          {highlight && report.meta?.drillable && (
            <button type="button" onClick={() => onRecords({ spec: report.spec, label: highlight })}
              className="rounded-lg border border-line px-2 py-1 font-bold text-ink hover:bg-muted/60">
              Records behind {formatLabel(highlight)}
            </button>
          )}
        </p>
      )}
    </>
  );
}

// The small print under a report: filters it could not apply, lines it
// left out, the conversion factor, a cached answer, a keyword match.
export function ReportNotes({ meta }) {
  return (
    <footer className="mt-5 space-y-1 border-t pt-3 text-xs empty:hidden"
            style={{ borderColor: BORDER, color: MUTED }}>
      {/* A filter the chosen report cannot apply means the
          answer is broader than the question. Say so. */}
      {meta?.droppedFilters && (
        <p>
          This report cannot be filtered by {meta.droppedFilters.join(', ')},
          so those were ignored.
        </p>
      )}

      {meta?.excludedLines > 0 && (
        <p>
          {meta.excludedLines} {meta.excludedKind === 'delivery' ? 'delivery' : 'dispatch'} line
          {meta.excludedLines === 1 ? '' : 's'} left out, not measured in kilograms.
        </p>
      )}

      {meta?.factor && (
        <p>
          Converted at {meta.factor.value} per kg.
          {meta.factor.note ? ` ${meta.factor.note}` : ''}
        </p>
      )}

      {meta?.cached && <p>Showing a recently cached result.</p>}

      {/* Every AI model was busy or out of quota, so the
          server matched the question by its keywords. */}
      {meta?.matchedBy === 'keyword' && (
        <p>
          Closest match: the AI assistant was busy, so this report was picked from the
          words in your question. Check it answers what you asked, or adjust it above.
        </p>
      )}
    </footer>
  );
}

// A comparison's chart, its caveat and a way to save it.
export function ComparisonCard({ comparison, preset, onSaved }) {
  return (
    <section className="mt-5 rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4 sm:p-5" style={{ borderColor: BORDER }}>
      <p className="text-sm font-medium">{comparison.description}</p>
      <p className="mt-1 text-xs" style={{ color: MUTED }}>{comparison.about}</p>
      {comparison.matchedBy === 'keyword' && (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Closest match: the AI assistant was busy, so this was picked from the words in your question.
        </p>
      )}
      <div className="mt-4">
        <ComparisonChart key={comparison.description} data={comparison} />
      </div>
      {comparison.caveat && (
        <p className="mt-3 border-t pt-3 text-xs" style={{ borderColor: BORDER, color: MUTED }}>{comparison.caveat}</p>
      )}
      <div className="mt-3">
        <SaveReport key={comparison.id} kind="comparison" spec={{ comparison: comparison.id }}
          defaultTitle={comparison.label ?? comparison.description} preset={preset} onSaved={onSaved} />
      </div>
    </section>
  );
}
