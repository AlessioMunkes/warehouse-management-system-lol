// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ComboChart.jsx
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
import { BAR_CURSOR, LINE_CURSOR, fmtTick, formatLabel } from './chartFormat';
import ChartTooltip from './ChartTooltip';
import { useChartMotion } from './useChartMotion';

const MUTED = 'var(--ink-soft)';
const LINE  = 'var(--line)';
const axis = { tick: { fill: MUTED, fontSize: 11 }, axisLine: { stroke: LINE }, tickLine: false };

// `print`: no animation, for the PDF report (captured as an image at once).
export default function ComboChart({ combo, syncId = 'combo', print = false }) {
  const animate = useChartMotion() && !print;
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
          <Tooltip active={print ? false : undefined} content={<ChartTooltip unit={combo.bars.unit} labelFor={(l) => `${formatLabel(l)} · ${combo.bars.label}`} />} cursor={print ? false : BAR_CURSOR} />
          <Bar dataKey="bars" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={animate} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs font-medium" style={{ color: MUTED }}>{combo.line.label}</p>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} syncId={syncId} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
          <XAxis dataKey="name" tickFormatter={formatLabel} {...axis} />
          <YAxis tickFormatter={(v) => fmtTick(v, combo.line.unit)} {...axis} width={52} />
          <Tooltip active={print ? false : undefined} content={<ChartTooltip unit={combo.line.unit} labelFor={(l) => `${formatLabel(l)} · ${combo.line.label}`} />} cursor={print ? false : LINE_CURSOR} />
          <Line type="monotone" dataKey="line" stroke="var(--viz-2)" strokeWidth={2} connectNulls isAnimationActive={animate}
            dot={{ r: 4, fill: 'var(--viz-2)', stroke: 'var(--surface)', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
