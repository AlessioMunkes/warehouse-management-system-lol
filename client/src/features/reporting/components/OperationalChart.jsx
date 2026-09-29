// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/OperationalChart.jsx
//
// The Operations chart (Recharts). It picks a view that suits the data:
//   one number       -> a big figure
//   over time        -> line, area or columns (with last year's line and
//                       unusual points circled, when available)
//   by category      -> bars, columns, donut or Pareto
//   two-way          -> stacked or grouped columns, or a heatmap
//   pipelines        -> a funnel; stock flow -> a waterfall;
//   category → where -> a flow (Sankey) diagram
//   any              -> a table with the same numbers (and CSV)
//
// Click a bar, point or cell to highlight it. The toolbar has top N,
// sorting, an average line and the manager's own target line (saved to
// their profile). `compact` is the small version for cards and related
// charts; `print` is the PDF version (no controls or animation).
//
// Colour is never the only signal: highlights are named, two-way charts
// have a legend, and the table view is always one click away.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { X } from 'lucide-react';
import {
  SERIES, VIEW_LABELS, anomaliesOf, defaultView, downloadCsv, fmtTick, fmtValue, formatLabel,
  isAdditive, pivot, ragColour, shapeOf, toCsv, unitWord, viewsFor,
} from '../chartFormat';
import { Flow, Funnel, Waterfall } from './OperationalDiagrams';

const INK    = 'var(--ink)';
const MUTED  = 'var(--ink-soft)';
const LINE   = 'var(--line)';
const SURF   = 'var(--surface)';
const SINGLE = 'var(--viz-1)';
const DIM    = 0.25;

const axisProps = {
  tick: { fill: MUTED, fontSize: 11 },
  axisLine: { stroke: LINE },
  tickLine: false,
};

// Values lead, labels follow; keyed with a short stroke, not a box.
function ChartTooltip({ active, payload, label, unit, labelFor }) {
  if (!active || !payload?.length) return null;
  const title = labelFor ? labelFor(label, payload) : formatLabel(label);
  return (
    <div className="rounded-[4px] border-2 bg-surface px-3 py-2 text-xs shadow-sm" style={{ borderColor: LINE }}>
      <p className="mb-1" style={{ color: MUTED }}>{title}</p>
      {payload.filter((p) => p.value !== undefined && p.value !== null).map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ background: p.color ?? p.payload?.fill ?? SINGLE }} />
          <span className="font-bold" style={{ color: INK }}>
            {fmtValue(p.value, unit)} {p.payload?.unit ?? unitWord(unit)}
          </span>
          {payload.length > 1 && <span style={{ color: MUTED }}>{formatLabel(p.name)}</span>}
          {p.payload?.cumulative !== undefined && (
            <span style={{ color: MUTED }}>· {p.payload.cumulative}% of total so far</span>
          )}
        </p>
      ))}
    </div>
  );
}

function Segmented({ views, view, onChange }) {
  return (
    <div role="group" aria-label="Chart type" className="inline-flex flex-wrap rounded-[4px] border-2" style={{ borderColor: LINE }}>
      {views.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === view}
          onClick={() => onChange(v)}
          className={`px-2.5 py-1 text-xs font-medium ${v === view ? 'bg-ink text-on-ink' : 'hover:bg-ink/5'}`}
        >
          {VIEW_LABELS[v]}
        </button>
      ))}
    </div>
  );
}

function TargetEditor({ target, unit, onSave, onReset, saving, error }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(target?.value ?? '');
  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(target?.value ?? ''); setEditing(true); }}
        className="underline underline-offset-2">
        {target ? 'Adjust target' : 'Set a target'}
      </button>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    const ok = await onSave(draft === '' ? null : Number(draft));
    if (ok) setEditing(false);
  };
  return (
    <form onSubmit={submit} className="inline-flex flex-wrap items-center gap-1">
      <label className="inline-flex items-center gap-1">
        <span style={{ color: MUTED }}>My target{unit === '%' ? ' (%)' : unit ? ` (${unitWord(unit) || unit})` : ''}</span>
        <input type="number" min="0" step="any" value={draft} autoFocus
          onChange={(e) => setDraft(e.target.value)}
          className="w-20 rounded-[4px] border-2 bg-surface px-1.5 py-0.5" style={{ borderColor: LINE }} />
      </label>
      <button type="submit" disabled={saving || draft === ''} className="rounded-[4px] bg-ink px-2 py-0.5 font-bold text-on-ink disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
      {target?.custom && (
        <button type="button" disabled={saving}
          onClick={async () => { if (await onReset()) setEditing(false); }}
          className="underline underline-offset-2">
          Reset to default{target.defaultValue != null ? ` (${fmtValue(target.defaultValue, unit)})` : ''}
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)} className="underline underline-offset-2">Cancel</button>
      {error && <span role="alert" className="w-full" style={{ color: 'var(--brand)' }}>{error}</span>}
    </form>
  );
}

function Heatmap({ rows, keys, unit, highlight, onPick }) {
  const max = Math.max(1, ...rows.flatMap((r) => keys.map((k) => Math.abs(r[k] ?? 0))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="text-left font-medium" style={{ color: MUTED }} />
            {rows.map((r) => <th key={r.name} className="px-1 font-medium" style={{ color: MUTED }}>{formatLabel(r.name)}</th>)}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row" className="pr-2 text-left font-medium" style={{ color: INK, opacity: highlight && highlight !== k ? 0.45 : 1 }}>
                {formatLabel(k)}
              </th>
              {rows.map((r) => {
                const v = r[k] ?? 0;
                // One hue, light to dark: sequential, not categorical.
                const pct = Math.round((Math.abs(v) / max) * 85) + (v ? 10 : 0);
                const dark = pct > 55;
                return (
                  <td
                    key={r.name}
                    onClick={() => onPick(k)}
                    title={`${formatLabel(k)}, ${formatLabel(r.name)}: ${fmtValue(v, unit)}`}
                    className="h-8 min-w-12 cursor-pointer rounded-[3px] px-1 text-center tabular-nums"
                    style={{
                      background: `color-mix(in srgb, var(--viz-1) ${pct}%, var(--surface))`,
                      // --surface is white in light mode (on dark blue)
                      // and near-black in dark mode (on the lighter blue).
                      color: dark ? SURF : INK,
                      opacity: highlight && highlight !== k ? DIM + 0.2 : 1,
                    }}
                  >
                    {v ? fmtTick(v, unit) : '–'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OperationalChart({
  report, dimensionLabel = 'Category', target = null, hint, compact = false,
  // For the PDF report: the full-size chart with its value labels, but
  // no toolbar or clickable extras, and no animation — the page is
  // captured as an image straight away, and a half-grown bar would be
  // printed as it stood.
  print = false,
  highlight: controlledHl, onHighlight, onTargetChange,
  // Optional (name, value) => colour | null. For charts where colour
  // carries a status (red/amber/green); null falls back to the palette.
  colorFor,
  // Keep the series in the order given instead of largest first — for
  // stages (a pipeline) where the order is the meaning.
  keepOrder: keepOrderProp = false,
  // The same report for the same period a year earlier, drawn as a
  // dashed line (or pale columns) behind this one. Time charts only.
  compare = null,
}) {
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError]   = useState(null);
  const saveTarget = async (value) => {
    setTargetSaving(true);
    setTargetError(null);
    try {
      await onTargetChange(value);
      return true;
    } catch (err) {
      setTargetError(err.message);
      return false;
    } finally {
      setTargetSaving(false);
    }
  };
  const unit = report?.meta?.unit;
  const series = useMemo(() => report?.series ?? [], [report]);
  const shape = shapeOf(report);
  const meta = report?.meta;
  const views = viewsFor(shape, unit, series, meta);
  // Days of the week keep Monday to Sunday.
  const keepOrder = keepOrderProp || Boolean(meta?.ordered);

  const [view, setView]       = useState(() => defaultView(views, report?.chartType, hint, meta));
  const [topN, setTopN]       = useState(compact ? 8 : 10);
  const [sortBy, setSortBy]   = useState('value');
  const [showAvg, setShowAvg] = useState(false);
  const [showTarget, setShowTarget] = useState(true);
  const [hidden, setHidden]   = useState(() => new Set());
  const [localHl, setLocalHl] = useState(null);

  const highlight = controlledHl !== undefined ? controlledHl : localHl;
  const setHighlight = (name) => {
    const next = name === highlight ? null : name;
    if (onHighlight) onHighlight(next);
    if (controlledHl === undefined) setLocalHl(next);
  };

  const activeView = views.includes(view) ? view : views[0];

  // Category rows after sort and top-N. Time rows keep their order.
  const rows = useMemo(() => {
    const base = series.map((r) => ({ name: r.label, value: r.value, unit: r.meta?.unit }));
    if (shape !== 'category' || keepOrder) return base;
    const sorted = [...base].sort((a, b) =>
      sortBy === 'name' ? String(a.name).localeCompare(String(b.name)) : Math.abs(b.value) - Math.abs(a.value));
    if (activeView === 'pareto') {
      const all = [...base].sort((a, b) => b.value - a.value);
      const total = all.reduce((s, r) => s + r.value, 0) || 1;
      let run = 0;
      return all.map((r) => { run += r.value; return { ...r, cumulative: Math.round((run / total) * 100) }; })
        .slice(0, topN === 0 ? undefined : topN);
    }
    return topN === 0 ? sorted : sorted.slice(0, topN);
  }, [series, shape, sortBy, topN, activeView, keepOrder]);

  const twoAxis = useMemo(() => (shape === 'twoAxis' ? pivot(series) : null), [shape, series]);

  const avg = series.length ? series.reduce((s, r) => s + r.value, 0) / series.length : 0;
  const hiddenCount = shape === 'category' && topN !== 0 ? Math.max(0, series.length - rows.length) : 0;
  const paretoCut = activeView === 'pareto' ? rows.find((r) => r.cumulative >= 80)?.name : null;
  const additive = isAdditive(unit, series);

  const opacityFor = (name) => (highlight && highlight !== name ? DIM : 1);
  const colourOf = (r, fallback) => colorFor?.(r.name, r.value) ?? ragColour(meta?.rag, r.value) ?? fallback;

  // Time charts: points far off the usual level, and last year's
  // figures lined up by position (month 1 against month 1).
  const isTimeView = shape === 'time' && ['line', 'area', 'bar'].includes(activeView);
  const anomalies = useMemo(() => (shape === 'time' ? anomaliesOf(rows) : []), [shape, rows]);
  const prevSeries = compare?.series ?? null;
  const timeRows = useMemo(() => (prevSeries
    ? rows.map((r, i) => ({ ...r, previous: prevSeries[i]?.value ?? null, previousLabel: prevSeries[i]?.label ?? null }))
    : rows), [rows, prevSeries]);
  const hbarHeight = Math.max(compact ? 150 : 180, rows.length * (compact ? 24 : 30) + 40);
  const height = compact ? 200 : 300;

  const refLines = (axis) => (
    <>
      {showAvg && !compact && (
        <ReferenceLine {...{ [axis]: avg }} stroke={MUTED} strokeDasharray="4 4"
          label={{ value: `Average ${fmtValue(avg, unit)}`, fill: MUTED, fontSize: 11, position: 'insideTopRight' }} />
      )}
      {target && showTarget && (
        // extendDomain: a target above every bar (compliance at 37% against
        // 90%) is exactly when the line matters, and Recharts would
        // otherwise drop it for falling outside the axis.
        <ReferenceLine {...{ [axis]: target.value }} ifOverflow="extendDomain" stroke={INK} strokeDasharray="6 3" strokeWidth={1.5}
          label={{ value: target.label, fill: INK, fontSize: 11, position: 'insideTopLeft' }} />
      )}
    </>
  );

  const exportCsv = () => {
    if (twoAxis) {
      const cols = [{ key: 'name', label: 'Month' }, ...twoAxis.keys.map((k) => ({ key: k, label: formatLabel(k) }))];
      downloadCsv('report.csv', toCsv(twoAxis.rows, cols));
    } else {
      downloadCsv('report.csv', toCsv(series.map((r) => ({ name: r.label, value: r.value, unit: r.meta?.unit ?? unit })),
        [{ key: 'name', label: dimensionLabel }, { key: 'value', label: 'Value' }, { key: 'unit', label: 'Unit' }]));
    }
  };

  if (!series.length) {
    return <p className="py-8 text-center text-sm" style={{ color: MUTED }}>Nothing recorded for this selection.</p>;
  }

  const tip = <Tooltip active={print ? false : undefined} content={<ChartTooltip unit={unit} />} cursor={print ? false : { fill: 'var(--line)', fillOpacity: 0.4 }} />;

  let body;
  if (activeView === 'number') {
    body = (
      <p className="py-6 text-center text-5xl font-bold tracking-tight">
        {fmtValue(series[0].value, unit)}
        {unitWord(unit) && <span className="ml-2 text-lg font-medium" style={{ color: MUTED }}>{unitWord(unit)}</span>}
      </p>
    );
  } else if (activeView === 'table') {
    body = (
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 text-left text-xs" style={{ borderColor: LINE, color: MUTED }}>
              <th className="py-1.5 pr-3 font-medium">{twoAxis ? 'Month' : dimensionLabel}</th>
              {twoAxis
                ? twoAxis.keys.map((k) => <th key={k} className="py-1.5 pr-3 text-right font-medium">{formatLabel(k)}</th>)
                : <th className="py-1.5 text-right font-medium">Value</th>}
            </tr>
          </thead>
          <tbody>
            {(twoAxis ? twoAxis.rows : series.map((r) => ({ name: r.label, value: r.value, unit: r.meta?.unit }))).map((r) => (
              <tr
                key={r.name}
                onClick={() => setHighlight(r.name)}
                className="cursor-pointer border-b hover:bg-ink/5"
                style={{ borderColor: LINE, fontWeight: highlight === r.name ? 700 : 400 }}
              >
                <td className="py-1.5 pr-3">{formatLabel(r.name)}</td>
                {twoAxis
                  ? twoAxis.keys.map((k) => <td key={k} className="py-1.5 pr-3 text-right tabular-nums">{fmtValue(r[k] ?? 0, unit)}</td>)
                  : <td className="py-1.5 text-right tabular-nums">{fmtValue(r.value, unit)} {r.unit ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (activeView === 'funnel') {
    body = <Funnel series={series} funnel={meta.funnel} unit={unit} highlight={highlight} onPick={setHighlight} />;
  } else if (activeView === 'waterfall') {
    body = <Waterfall series={series} unit={unit} height={height} compact={compact} />;
  } else if (activeView === 'sankey') {
    body = <Flow series={series} unit={unit} height={compact ? 220 : 340} />;
  } else if (activeView === 'heatmap') {
    body = <Heatmap rows={twoAxis.rows} keys={twoAxis.keys} unit={unit} highlight={highlight} onPick={setHighlight} />;
  } else if (activeView === 'stacked' || activeView === 'grouped') {
    const stacked = activeView === 'stacked';
    body = (
      <ResponsiveContainer width="100%" height={height + 30}>
        <BarChart data={twoAxis.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
          <XAxis dataKey="name" tickFormatter={formatLabel} {...axisProps} />
          <YAxis tickFormatter={(v) => fmtTick(v, unit)} {...axisProps} width={52} />
          <Tooltip active={print ? false : undefined} content={<ChartTooltip unit={unit} />} cursor={print ? false : { fill: 'var(--line)', fillOpacity: 0.4 }} />
          <Legend
            iconType="rect"
            onClick={(e) => setHidden((h) => { const n = new Set(h); if (n.has(e.dataKey)) n.delete(e.dataKey); else n.add(e.dataKey); return n; })}
            formatter={(v) => <span style={{ color: hidden.has(v) ? MUTED : INK, textDecoration: hidden.has(v) ? 'line-through' : 'none', cursor: 'pointer', fontSize: 12 }}>{formatLabel(v)}</span>}
          />
          {twoAxis.keys.map((k, i) => (
            <Bar
              key={k} dataKey={k} name={k} stackId={stacked ? 'a' : undefined}
              fill={SERIES[i]} hide={hidden.has(k)} fillOpacity={opacityFor(k)}
              stroke={SURF} strokeWidth={stacked ? 2 : 0}
              radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={48} isAnimationActive={!print}
              onClick={() => setHighlight(k)} cursor="pointer"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  } else if (activeView === 'line' || activeView === 'area') {
    const Chart = prevSeries ? ComposedChart : activeView === 'line' ? LineChart : AreaChart;
    const hlRow = rows.find((r) => r.name === highlight);
    body = (
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={timeRows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          onClick={(e) => e?.activeLabel && setHighlight(e.activeLabel)}>
          <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
          <XAxis dataKey="name" tickFormatter={formatLabel} {...axisProps} />
          <YAxis tickFormatter={(v) => fmtTick(v, unit)} {...axisProps} width={52} />
          <Tooltip active={print ? false : undefined} content={<ChartTooltip unit={unit} />} cursor={print ? false : { stroke: MUTED, strokeWidth: 1 }} />
          {refLines('y')}
          {prevSeries && (
            <Line type="monotone" dataKey="previous" name="Same period last year" stroke={MUTED} strokeWidth={2}
              strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
          )}
          {activeView === 'line'
            ? <Line type="monotone" dataKey="value" name="This period" stroke={SINGLE} strokeWidth={2} dot={{ r: 4, fill: SINGLE, stroke: SURF, strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={!print} />
            : <Area type="monotone" dataKey="value" name="This period" stroke={SINGLE} strokeWidth={2} fill={SINGLE} fillOpacity={0.15} isAnimationActive={!print} />}
          {!compact && anomalies.map((a) => (
            <ReferenceDot key={`anomaly-${a.name}`} x={a.name} y={a.value} r={8} fill="none" stroke="var(--rag-bad)" strokeWidth={2.5} />
          ))}
          {hlRow && <ReferenceDot x={hlRow.name} y={hlRow.value} r={7} fill={SINGLE} stroke={INK} strokeWidth={2}
            label={{ value: fmtValue(hlRow.value, unit), position: 'top', fill: INK, fontSize: 12, fontWeight: 700 }} />}
        </Chart>
      </ResponsiveContainer>
    );
  } else if (activeView === 'donut') {
    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    body = (
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            {tip}
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke={SURF} strokeWidth={2}
              onClick={(d) => setHighlight(d.name)} cursor="pointer" isAnimationActive={false}>
              {rows.map((r, i) => <Cell key={r.name} fill={colourOf(r, SERIES[i % SERIES.length])} fillOpacity={opacityFor(r.name)} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <ul className="w-full space-y-1 text-xs sm:max-w-56">
          {rows.map((r, i) => (
            <li key={r.name}>
              <button type="button" onClick={() => setHighlight(r.name)} className="flex w-full items-center gap-2 text-left"
                style={{ opacity: opacityFor(r.name) === 1 ? 1 : 0.5, fontWeight: highlight === r.name ? 700 : 400 }}>
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colourOf(r, SERIES[i % SERIES.length]) }} />
                <span className="min-w-0 flex-1 truncate">{formatLabel(r.name)}</span>
                <span className="tabular-nums" style={{ color: MUTED }}>{Math.round((r.value / total) * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    // bar, hbar, pareto
    const horizontal = activeView === 'hbar';
    const odd = new Set(anomalies.map((a) => a.name));
    const withPrev = isTimeView && prevSeries && !horizontal;
    body = (
      <ResponsiveContainer width="100%" height={horizontal ? hbarHeight : height}>
        <BarChart data={withPrev ? timeRows : rows} layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 12, right: horizontal ? 48 : 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke={LINE} strokeOpacity={0.6} />
          {horizontal ? (
            <>
              <XAxis type="number" tickFormatter={(v) => fmtTick(v, unit)} {...axisProps} />
              <YAxis type="category" dataKey="name" width={compact ? 110 : 150} tickFormatter={(v) => {
                const s = formatLabel(v); return s.length > 22 ? `${s.slice(0, 21)}…` : s;
              }} {...axisProps} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tickFormatter={(v) => { const s = formatLabel(v); return s.length > 12 ? `${s.slice(0, 11)}…` : s; }} {...axisProps} interval={0} />
              <YAxis tickFormatter={(v) => fmtTick(v, unit)} {...axisProps} width={52} />
            </>
          )}
          {tip}
          {refLines(horizontal ? 'x' : 'y')}
          {paretoCut && (
            <ReferenceLine x={paretoCut} stroke={INK} strokeDasharray="6 3"
              label={{ value: '80% of the total by here', fill: INK, fontSize: 11, position: 'insideTopRight' }} />
          )}
          {withPrev && (
            <Bar dataKey="previous" name="Same period last year" fill={MUTED} fillOpacity={0.35}
              radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
          )}
          <Bar dataKey="value" name="This period" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 22 : 48} isAnimationActive={!print}
            label={!compact && rows.length <= 15 ? {
              position: horizontal ? 'right' : 'top', fill: MUTED, fontSize: 11,
              formatter: (v) => fmtTick(v, unit),
            } : false}>
            {rows.map((r) => (
              <Cell
                key={r.name}
                fill={colourOf(r, SINGLE)}
                fillOpacity={opacityFor(r.name)}
                stroke={highlight === r.name ? INK : odd.has(r.name) && !compact ? 'var(--rag-bad)' : 'none'}
                strokeWidth={highlight === r.name || (odd.has(r.name) && !compact) ? 2 : 0}
                cursor="pointer"
                onClick={() => setHighlight(r.name)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const findable = shape === 'category' && series.length > 8;

  return (
    <figure className="m-0" aria-label={`${VIEW_LABELS[activeView]} chart by ${dimensionLabel.toLowerCase()}`}>
      {!compact && !print && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Segmented views={views} view={activeView} onChange={setView} />

          {shape === 'category' && !['table', 'funnel', 'waterfall', 'sankey'].includes(activeView) && series.length > 5 && (
            <label className="inline-flex items-center gap-1">
              <span style={{ color: MUTED }}>Show</span>
              <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}
                className="rounded-[4px] border-2 bg-surface px-1.5 py-0.5" style={{ borderColor: LINE }}>
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={0}>All {series.length}</option>
              </select>
            </label>
          )}

          {shape === 'category' && ['hbar', 'bar'].includes(activeView) && (
            <label className="inline-flex items-center gap-1">
              <span style={{ color: MUTED }}>Sort</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="rounded-[4px] border-2 bg-surface px-1.5 py-0.5" style={{ borderColor: LINE }}>
                <option value="value">By value</option>
                <option value="name">By name</option>
              </select>
            </label>
          )}

          {['hbar', 'bar', 'line', 'area'].includes(activeView) && series.length > 1 && (
            <label className="inline-flex cursor-pointer items-center gap-1">
              <input type="checkbox" checked={showAvg} onChange={(e) => setShowAvg(e.target.checked)} />
              Average
            </label>
          )}

          {target && ['hbar', 'bar', 'line', 'area'].includes(activeView) && (
            <label className="inline-flex cursor-pointer items-center gap-1">
              <input type="checkbox" checked={showTarget} onChange={(e) => setShowTarget(e.target.checked)} />
              {target.label}{target.custom ? ' (mine)' : ''}
            </label>
          )}

          {onTargetChange && ['hbar', 'bar', 'line', 'area'].includes(activeView) && (
            <TargetEditor
              target={target} unit={unit}
              onSave={saveTarget} onReset={() => saveTarget(null)}
              saving={targetSaving} error={targetError}
            />
          )}

          {findable && (
            <label className="inline-flex items-center gap-1">
              <span className="sr-only">Find and highlight</span>
              <input
                list="op-chart-find"
                placeholder="Find…"
                onChange={(e) => { const hit = series.find((r) => r.label === e.target.value); if (hit) setHighlight(hit.label); }}
                className="w-32 rounded-[4px] border-2 bg-surface px-1.5 py-0.5" style={{ borderColor: LINE }}
              />
              <datalist id="op-chart-find">
                {series.map((r) => <option key={r.label} value={r.label} />)}
              </datalist>
            </label>
          )}

          <button type="button" onClick={exportCsv} className="ml-auto underline underline-offset-2">Export CSV</button>
        </div>
      )}

      {highlight && !compact && !print && (
        <p className="mb-2 inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-xs font-medium" style={{ borderColor: INK }}>
          Highlighting: {formatLabel(highlight)}
          <button type="button" aria-label="Clear highlight" onClick={() => setHighlight(highlight)}>
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </p>
      )}

      {body}

      {!compact && !print && hiddenCount > 0 && (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Showing {rows.length} of {series.length}. Choose “All” to see the rest.
        </p>
      )}
      {!compact && isTimeView && prevSeries && (
        <p className="mt-1 flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <span aria-hidden="true" className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: MUTED }} />
          Same period last year
          {compact ? null : ` (${compare.spec?.dateRange?.from} to ${compare.spec?.dateRange?.to})`}
          {!prevSeries.length && ': nothing was recorded then.'}
        </p>
      )}
      {!compact && isTimeView && anomalies.length > 0 && (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          <span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 align-middle" style={{ borderColor: 'var(--rag-bad)' }} />
          Stands out from the usual level (about {fmtValue(anomalies[0].usual, unit)} {unitWord(unit)}):{' '}
          {anomalies.map((a) => `${formatLabel(a.name)} is unusually ${a.direction} at ${fmtValue(a.value, unit)}`).join('; ')}.
          Worth checking what happened.
        </p>
      )}
      {!compact && activeView === 'pareto' && additive && (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Sorted biggest first. Hover a bar for its running share of the total.
        </p>
      )}
    </figure>
  );
}
