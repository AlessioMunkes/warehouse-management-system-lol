// ─────────────────────────────────────────────────────────────
// client/src/features/inventory/BalanceChart.jsx
//
// Stock balance over time, for one product.
//
// The series is derived rather than stored — see balanceSeries.js,
// which reconstructs it by walking today's on-hand back through the
// movement ledger.
//
// ONE SERIES, SO NO LEGEND
// The panel title says what this is. A legend box for a single line is
// furniture. The one thing that is direct-labelled is the endpoint,
// because "what is it now" is the question people open this with;
// every other value is on the hover tip and, more importantly, in the
// figures directly above the chart — the chart never gates a number.
//
// The dashed rule is the reorder threshold. Dashes are noise on a
// gridline but they are the right signal for an actual threshold, which
// is what this is: everything below the line is a reorder.
//
// Drawn with Recharts and the shared tip (ChartTooltip.jsx), in the
// theme's first chart colour, like every other trend in the app.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { buildSeries } from './balanceSeries';
import { ChartTip } from '../reporting/ChartTooltip';
import { LINE_CURSOR, SERIES } from '../reporting/chartFormat';

const TREND = SERIES[0];
const GRID  = 'var(--line)';
const INK   = 'var(--ink)';
const MUTED = 'var(--ink-soft)';

const fmtDate = (t) => new Date(t).toLocaleDateString('en-ZA', {
  day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg',
});

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function BalanceTip({ active, payload, unit }) {
  const p = active && payload?.[0]?.payload;
  if (!p) return null;
  return (
    <ChartTip
      title={fmtDate(p.t)}
      rows={[{ color: TREND, value: `${fmtNum(p.v)}${unit ? ` ${unit}` : ''}` }]}
      extra={[p.movement ? (p.movement.movementType?.replace(/_/g, ' ') ?? 'movement') : 'now']}
    />
  );
}

export default function BalanceChart({ movements, onHand, reorderAt = 0, unit = '' }) {
  const points = useMemo(() => buildSeries(movements, onHand), [movements, onHand]);

  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-soft">
        No movements recorded yet, so there is no history to plot.
      </p>
    );
  }

  const last = points[points.length - 1];
  const threshold = Number(reorderAt) || 0;
  const tMin = points[0].t;
  const tMax = last.t;

  return (
    <figure className="m-0" role="img" aria-label={`Stock balance over time. Now ${fmtNum(last.v)} ${unit}.`}>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={points} margin={{ top: 12, right: 64, left: 8, bottom: 0 }}>
          {/* Hairline grid, solid: dashes here would read as a threshold,
              and there is a real one that needs to own that. */}
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="t" type="number" scale="time" domain={[tMin, tMax]}
            ticks={tMin === tMax ? [tMin] : [tMin, tMax]} tickFormatter={fmtDate}
            tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false}
          />
          {/* The threshold is part of the picture: a balance that never
              comes near it should still show how far away it is. */}
          <YAxis hide domain={[(min) => Math.min(min, 0), (max) => Math.max(max, threshold, 1)]} />
          <Tooltip cursor={LINE_CURSOR} content={<BalanceTip unit={unit} />} />
          <Area type="linear" dataKey="v" stroke={TREND} strokeWidth={2} fill={TREND} fillOpacity={0.08}
            dot={false} activeDot={{ r: 4, fill: TREND, stroke: 'var(--surface)', strokeWidth: 2 }} />
          {threshold > 0 ? (
            <ReferenceLine y={threshold} stroke={MUTED} strokeDasharray="4 4"
              label={{ value: `reorder ${fmtNum(threshold)}`, position: 'right', fill: MUTED, fontSize: 10 }} />
          ) : null}
          {/* The endpoint, direct-labelled. The only value on the plot
              that gets a number of its own. */}
          <ReferenceDot x={last.t} y={last.v} r={4} fill={TREND} stroke="var(--surface)" strokeWidth={2}
            label={{ value: `${fmtNum(last.v)}${unit ? ` ${unit}` : ''}`, position: 'right', fill: INK, fontSize: 11, fontWeight: 600 }} />
        </AreaChart>
      </ResponsiveContainer>

      <figcaption className="mt-1 min-h-5 text-xs text-ink-soft">
        {`Balance after each of the last ${points.length - (last.movement ? 0 : 1)} movements. Point at the line for a date.`}
      </figcaption>
    </figure>
  );
}
