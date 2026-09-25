// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ComboChart.jsx
//
// Two measures over the same months — e.g. spend and unit price.
// Drawn as two small charts stacked on one shared month axis, NOT as
// bars and a line on two y-scales: a dual axis lets the scale choice
// invent a correlation. syncId links the hover, so pointing at a
// month in one shows the same month in the other.
// ─────────────────────────────────────────────────────────────
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmtTick, fmtValue, formatLabel, unitWord } from '../chartFormat';

const MUTED = 'var(--ink-soft)';
const LINE  = 'var(--line)';
const INK   = 'var(--ink)';
const axis = { tick: { fill: MUTED, fontSize: 11 }, axisLine: { stroke: LINE }, tickLine: false };

function Tip({ active, payload, label, unit, name }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[4px] border-2 bg-surface px-3 py-2 text-xs" style={{ borderColor: LINE }}>
      <p style={{ color: MUTED }}>{formatLabel(label)} · {name}</p>
      <p className="font-bold" style={{ color: INK }}>{fmtValue(payload[0].value, unit)} {unitWord(unit)}</p>
    </div>
  );
}

export default function ComboChart({ combo, syncId = 'combo' }) {
  const months = [...new Set([...combo.bars.series, ...combo.line.series].map((r) => r.label))].sort();
  const data = months.map((m) => ({
    name: m,
    bars: combo.bars.series.find((r) => r.label === m)?.value ?? null,
    line: combo.line.series.find((r) => r.label === m)?.value ?? null,
  }));
  if (data.length < 2) {
    return <p className="text-xs" style={{ color: MUTED }}>Not enough months yet to compare the two.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium" style={{ color: MUTED }}>{combo.bars.label}</p>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} syncId={syncId} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
          <XAxis dataKey="name" hide />
          <YAxis tickFormatter={(v) => fmtTick(v, combo.bars.unit)} {...axis} width={52} />
          <Tooltip content={<Tip unit={combo.bars.unit} name={combo.bars.label} />} cursor={{ fill: LINE, fillOpacity: 0.4 }} />
          <Bar dataKey="bars" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs font-medium" style={{ color: MUTED }}>{combo.line.label}</p>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} syncId={syncId} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
          <XAxis dataKey="name" tickFormatter={formatLabel} {...axis} />
          <YAxis tickFormatter={(v) => fmtTick(v, combo.line.unit)} {...axis} width={52} />
          <Tooltip content={<Tip unit={combo.line.unit} name={combo.line.label} />} cursor={{ stroke: MUTED }} />
          <Line type="monotone" dataKey="line" stroke="var(--viz-2)" strokeWidth={2} connectNulls
            dot={{ r: 4, fill: 'var(--viz-2)', stroke: 'var(--surface)', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
