// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ComparisonChart.jsx
//
// A scatter plot of one declared comparison (reportComparisons.js on
// the server): one dot per centre, supplier, product or packer.
//
// One colour for every dot — identity comes from the label, the
// tooltip and the table, not from a hue per item. Dashed lines at
// the averages split the plot into four quarters, which is usually
// the question being asked ("big centres collecting little").
// Clicking a dot or a table row highlights it; the dot gets a ring
// and its name is printed beside it.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { downloadCsv, fmtTick, fmtValue, toCsv, unitWord } from '../chartFormat';

const MUTED = 'var(--ink-soft)';
const LINE  = 'var(--line)';
const INK   = 'var(--ink)';
const DOT   = 'var(--viz-1)';
const axis = { tick: { fill: MUTED, fontSize: 11 }, axisLine: { stroke: LINE }, tickLine: false };

function Tip({ active, payload, data }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-[4px] border-2 bg-surface px-3 py-2 text-xs" style={{ borderColor: LINE }}>
      <p className="font-bold" style={{ color: INK }}>{p.label}</p>
      <p>{data.x.label}: <strong>{fmtValue(p.x, data.x.unit)}</strong> {unitWord(data.x.unit)}</p>
      <p>{data.y.label}: <strong>{fmtValue(p.y, data.y.unit)}</strong> {unitWord(data.y.unit)}</p>
      {p.detail && <p style={{ color: MUTED }}>{p.detail}</p>}
    </div>
  );
}

export default function ComparisonChart({ data }) {
  const [highlight, setHighlight] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const pts = data.points ?? [];
  const toggle = (label) => setHighlight((h) => (h === label ? null : label));

  if (!pts.length) {
    return <p className="py-8 text-center text-sm" style={{ color: MUTED }}>Nothing recorded for this period.</p>;
  }

  const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const avgY = pts.reduce((s, p) => s + p.y, 0) / pts.length;

  return (
    <figure className="m-0" aria-label={`Scatter plot: ${data.y.label} against ${data.x.label}`}>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => setShowTable((v) => !v)} className="underline underline-offset-2">
          {showTable ? 'Show chart' : 'Show table'}
        </button>
        <button type="button" onClick={() => downloadCsv(`${data.id}.csv`, toCsv(pts, [
          { key: 'label', label: 'Item' }, { key: 'x', label: data.x.label }, { key: 'y', label: data.y.label }, { key: 'detail', label: 'Detail' },
        ]))} className="underline underline-offset-2">Export CSV</button>
        {highlight && (
          <button type="button" onClick={() => setHighlight(null)} className="rounded-full border-2 px-2 py-0.5 font-medium" style={{ borderColor: INK }}>
            Highlighting: {highlight} ✕
          </button>
        )}
      </div>

      {showTable ? (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 text-left text-xs" style={{ borderColor: LINE, color: MUTED }}>
                <th className="py-1.5 pr-3 font-medium">Item</th>
                <th className="py-1.5 pr-3 text-right font-medium">{data.x.label}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{data.y.label}</th>
                <th className="py-1.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {[...pts].sort((a, b) => b.y - a.y).map((p) => (
                <tr key={p.label} onClick={() => toggle(p.label)} className="cursor-pointer border-b hover:bg-ink/5"
                  style={{ borderColor: LINE, fontWeight: highlight === p.label ? 700 : 400 }}>
                  <td className="py-1.5 pr-3">{p.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtValue(p.x, data.x.unit)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtValue(p.y, data.y.unit)}</td>
                  <td className="py-1.5 text-xs" style={{ color: MUTED }}>{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 20 }}>
            <CartesianGrid stroke={LINE} strokeOpacity={0.6} />
            <XAxis type="number" dataKey="x" name={data.x.label} tickFormatter={(v) => fmtTick(v, data.x.unit)} {...axis}
              label={{ value: data.x.label, position: 'insideBottom', offset: -12, fill: MUTED, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name={data.y.label} tickFormatter={(v) => fmtTick(v, data.y.unit)} {...axis} width={56}
              label={{ value: data.y.label, angle: -90, position: 'insideLeft', fill: MUTED, fontSize: 11 }} />
            {/* ~10px dots; the tooltip's hit area is the nearest point. */}
            <ZAxis range={[90, 90]} />
            <ReferenceLine x={avgX} stroke={MUTED} strokeDasharray="4 4" />
            <ReferenceLine y={avgY} stroke={MUTED} strokeDasharray="4 4"
              label={{ value: 'averages', position: 'insideTopRight', fill: MUTED, fontSize: 11 }} />
            <Tooltip content={<Tip data={data} />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={pts} onClick={(p) => toggle(p.label ?? p.payload?.label)} cursor="pointer" isAnimationActive={false}>
              {pts.map((p) => (
                <Cell key={p.label} fill={DOT}
                  fillOpacity={highlight && highlight !== p.label ? 0.25 : 0.85}
                  stroke={highlight === p.label ? INK : 'var(--surface)'} strokeWidth={2} />
              ))}
              <LabelList dataKey="label" position="top" fontSize={11} fill={INK}
                formatter={(v) => (v === highlight ? v : '')} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </figure>
  );
}
