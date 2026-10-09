// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/OperationalDiagrams.jsx
//
// The diagrams OperationalChart draws when a report asks for them:
//   Funnel    - a pipeline by status, read as stages (meta.funnel)
//   Waterfall - opening stock, what came in and out, closing (meta.waterfall)
//   Flow      - a Sankey from one grouping to another (meta.flows)
// Each one also shows its numbers as text, not just shapes.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowDown } from 'lucide-react';
import { SERIES, flowOf, fmtTick, fmtValue, formatLabel, funnelOf, unitWord, waterfallOf } from './chartFormat';

const INK   = 'var(--ink)';
const MUTED = 'var(--ink-soft)';
const LINE  = 'var(--line)';
const SURF  = 'var(--surface)';

const axisProps = { tick: { fill: MUTED, fontSize: 11 }, axisLine: { stroke: LINE }, tickLine: false };

// ── Funnel ────────────────────────────────────────────────────
export function Funnel({ series, funnel, unit, highlight, onPick }) {
  const { stages, exits } = useMemo(() => funnelOf(series, funnel), [series, funnel]);
  const top = stages[0]?.reached || 0;
  const word = unitWord(unit) || unit || '';
  if (!top && !exits.length) return <p className="py-8 text-center text-sm" style={{ color: MUTED }}>Nothing recorded for this selection.</p>;

  return (
    <div className="space-y-1">
      <ol className="space-y-1" aria-label="Stages, first to last">
        {stages.map((s, i) => {
          const width = top ? Math.max(6, (s.reached / top) * 100) : 6;
          const dim = highlight && highlight !== s.id;
          return (
            <li key={s.id}>
              {i > 0 && (
                <p className="flex items-center justify-center gap-1 py-0.5 text-[11px]" style={{ color: MUTED }}>
                  <ArrowDown aria-hidden="true" className="h-3 w-3" />
                  {s.fromPrev === null ? '–' : `${s.fromPrev}% got this far`}
                </p>
              )}
              <button type="button" onClick={() => onPick(s.id)}
                className="grid w-full grid-cols-[minmax(7rem,11rem)_1fr_minmax(6rem,9rem)] items-center gap-3 text-left text-xs"
                style={{ opacity: dim ? 0.45 : 1 }}>
                <span className="font-medium" style={{ color: INK, fontWeight: highlight === s.id ? 700 : 500 }}>{formatLabel(s.id)}</span>
                <span className="flex justify-center">
                  <span className="flex h-8 items-center justify-center rounded-md text-xs font-bold tabular-nums"
                    style={{ width: `${width}%`, background: SERIES[0], color: SURF, outline: highlight === s.id ? `2px solid ${INK}` : 'none', outlineOffset: 1 }}>
                    {s.reached}
                  </span>
                </span>
                <span className="tabular-nums" style={{ color: MUTED }}>
                  {i === 0 ? 'all that started' : `${s.ofStart}% of the start`}
                  <br />{s.here} {word} here now
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {exits.length > 0 && (
        <p className="pt-2 text-xs" style={{ color: MUTED }}>
          <span className="font-medium" style={{ color: INK }}>Left the pipeline: </span>
          {exits.map((e) => `${formatLabel(e.id)} ${e.value}`).join(' · ')}
        </p>
      )}
      <p className="text-xs" style={{ color: MUTED }}>
        Each bar counts everything that reached that stage or went past it, so the funnel narrows where work stalls.
      </p>
    </div>
  );
}

// ── Waterfall ─────────────────────────────────────────────────
export function Waterfall({ series, unit, height = 300, compact = false }) {
  const rows = useMemo(() => waterfallOf(series), [series]);
  const fill = (r) => (r.kind === 'total' ? SERIES[0] : r.signed >= 0 ? 'var(--rag-good)' : 'var(--rag-bad)');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
        <XAxis dataKey="name" {...axisProps} interval={0} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
        <YAxis tickFormatter={(v) => fmtTick(v, unit)} {...axisProps} width={56} />
        <Tooltip
          cursor={{ fill: 'var(--line)', fillOpacity: 0.4 }}
          content={({ active, payload }) => {
            const r = active && payload?.[0]?.payload;
            if (!r) return null;
            return (
              <div className="rounded-lg border bg-surface px-3 py-2 text-xs shadow-sm" style={{ borderColor: LINE }}>
                <p className="mb-1" style={{ color: MUTED }}>{r.name}</p>
                <p className="font-bold" style={{ color: INK }}>
                  {r.kind === 'total' ? '' : r.signed >= 0 ? '+' : '−'}{fmtValue(r.value, unit)} {unitWord(unit)}
                </p>
                {r.kind !== 'total' && <p style={{ color: MUTED }}>Level after: {fmtValue(r.end, unit)} {unitWord(unit)}</p>}
              </div>
            );
          }}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="w" radius={[3, 3, 0, 0]} maxBarSize={56} isAnimationActive={false}
          label={compact ? false : {
            position: 'top', fill: MUTED, fontSize: 11,
            content: ({ x, y, width, index }) => {
              const r = rows[index];
              if (!r) return null;
              const text = r.kind === 'total' ? fmtTick(r.value, unit) : `${r.signed >= 0 ? '+' : '−'}${fmtTick(r.value, unit)}`;
              return <text x={x + width / 2} y={y - 5} textAnchor="middle" fill={MUTED} fontSize={11}>{text}</text>;
            },
          }}>
          {rows.map((r) => <Cell key={r.name} fill={fill(r)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Flow (Sankey) ─────────────────────────────────────────────
function FlowNode({ x, y, width, height, index, payload }) {
  const left = payload.side === 'from';
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={SERIES[index % SERIES.length]} fillOpacity={0.95} />
      <text x={left ? x - 6 : x + width + 6} y={y + height / 2} textAnchor={left ? 'end' : 'start'}
        dominantBaseline="middle" fontSize={11} fill={INK}>
        {payload.name} <tspan fill={MUTED}>{payload.value}</tspan>
      </text>
    </Layer>
  );
}

export function Flow({ series, unit, height = 320 }) {
  const data = useMemo(() => flowOf(series), [series]);
  if (!data.links.length) return <p className="py-8 text-center text-sm" style={{ color: MUTED }}>Nothing recorded for this selection.</p>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <Sankey data={data} nodePadding={18} nodeWidth={12} iterations={32}
          margin={{ top: 8, right: 170, bottom: 8, left: 170 }}
          node={<FlowNode />}
          link={{ stroke: 'var(--viz-1)', strokeOpacity: 0.25 }}>
          <Tooltip content={({ active, payload }) => {
            const p = active && payload?.[0]?.payload;
            if (!p) return null;
            const label = p.source && p.target ? `${p.source.name} → ${p.target.name}` : p.name;
            return (
              <div className="rounded-lg border bg-surface px-3 py-2 text-xs shadow-sm" style={{ borderColor: LINE }}>
                <p style={{ color: MUTED }}>{label}</p>
                <p className="font-bold" style={{ color: INK }}>{fmtValue(p.value, unit)} {unitWord(unit)}</p>
              </div>
            );
          }} />
        </Sankey>
      </ResponsiveContainer>
      <p className="sr-only">
        {data.links.map((l) => `${data.nodes[l.source].name} to ${data.nodes[l.target].name}: ${l.value}`).join('; ')}
      </p>
    </div>
  );
}
