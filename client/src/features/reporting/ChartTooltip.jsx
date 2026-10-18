// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ChartTooltip.jsx
//
// The one hover tip every chart in the app uses, so a figure reads the
// same way wherever it is pointed at:
//
//   title    what was pointed at (the bar's full name, the month)
//   rows     one per series: a short stroke of the series colour, the
//            figure and its unit in bold, then the series name when
//            there is more than one
//   extra    quiet lines under the figures (share of the total, the
//            running share, a point's detail)
//   notes    the report's note, one short line per point, under a rule
//
// The figure leads and the name follows: the reader already knows
// which series they pointed at and wants the number.
//
// ChartTip is the box itself, for a chart that places its own tip.
// The default export is the Recharts `content` adapter. The figure,
// share and cursor helpers it uses are in chartFormat.js.
// ─────────────────────────────────────────────────────────────
import { figure, formatLabel, noteLines, shareLine } from './chartFormat';

export function ChartTip({ title, rows = [], extra = [], notes = [] }) {
  return (
    <div
      data-testid="chart-tip"
      className="max-w-60 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink shadow-sm"
    >
      {title ? <p className="mb-1 text-ink-soft">{title}</p> : null}
      {rows.map((row, i) => (
        <p key={row.name ?? i} className="flex items-center gap-2">
          {row.color ? (
            <span aria-hidden="true" className="inline-block h-0.5 w-3 shrink-0" style={{ background: row.color }} />
          ) : null}
          <span className="font-bold">{row.value}</span>
          {row.name ? <span className="text-ink-soft">{row.name}</span> : null}
        </p>
      ))}
      {extra.filter(Boolean).map((line) => <p key={line} className="text-ink-soft">{line}</p>)}
      {notes.length ? (
        <ul className="mt-1.5 space-y-1 border-t border-line pt-1.5 text-ink-soft">
          {notes.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Recharts `<Tooltip content={<ChartTooltip ... />} />`.
 *
 *   unit      the report's unit, for the figure
 *   labelFor  (label, payload) => title, when the label needs more than formatLabel
 *   total     the series total, to add "n% of the total" (leave out when it does not add up)
 *   note      the report's note, shown under a rule
 *   extraFor  (payload) => [lines], anything particular to one chart
 */
export default function ChartTooltip({
  active, payload, label, unit, labelFor, total, note, extraFor,
}) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => p.value !== undefined && p.value !== null);
  if (!shown.length) return null;
  const many = shown.length > 1;
  const title = labelFor ? labelFor(label, payload) : formatLabel(label ?? shown[0].payload?.name ?? '');

  return (
    <ChartTip
      title={title}
      rows={shown.map((p) => ({
        color: p.color ?? p.payload?.fill,
        value: figure(p.value, unit, p.payload?.unit),
        name: many ? formatLabel(p.name) : null,
      }))}
      extra={[
        !many && total ? shareLine(shown[0].value, total) : null,
        ...(extraFor ? extraFor(shown) : []),
      ]}
      notes={noteLines(note)}
    />
  );
}
