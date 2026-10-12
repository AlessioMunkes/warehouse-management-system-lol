// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/BeneficiaryTypeChart.jsx
//
// A different question from any single metric on this page: not
// "how much of X" but "who did the warehouse reach this period,
// broken down by beneficiary type." Children are headcounted;
// adults/dignity-kitchen guests/households are all estimates
// converted from kilograms dispatched, each at its own manager-set
// factor — mixing a real count with three estimates in one chart
// would be dishonest without saying so, so every row prints its own
// unit rather than pretending they're the same kind of number, and
// there is no value axis to suggest otherwise.
//
// Not built on ReportChart — that component draws one metric's own
// dimension breakdown; this draws four different metrics' totals
// side by side, which is a different shape entirely. Drawn with
// Recharts and the shared tip (ChartTooltip.jsx) like every other
// chart. A row still loading, not set up or failed says so in words
// beside its name instead of drawing an empty bar.
// ─────────────────────────────────────────────────────────────
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTip } from './ChartTooltip';
import { BAR_CURSOR } from './chartFormat';
import { useChartMotion } from './useChartMotion';

const INK = 'var(--ink)';
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('en-ZA');
const ready = (stat) => stat && !stat.notReady && !stat.error;

function BeneficiaryTip({ active, payload }) {
  const row = active && payload?.[0]?.payload;
  if (!row) return null;
  return (
    <ChartTip
      title={row.label}
      rows={[{ color: row.color, value: `${fmtNum(row.value)} ${row.unit}` }]}
      extra={[row.estimated ? 'An estimate, from kilograms dispatched' : 'Counted']}
    />
  );
}

export default function BeneficiaryTypeChart({ items }) {
  const animate = useChartMotion();
  const rows = items.filter(({ stat }) => ready(stat)).map(({ metric, label, unit, color, stat }) => ({
    metric, label, unit, color, value: stat.value, estimated: metric !== 'children_reached',
  }));
  const waiting = items.filter(({ stat }) => !ready(stat));

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Beneficiaries by type</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Who the warehouse reached this period. Children are headcounted while adults are
          estimated, converted via kilograms dispatched per kitchen. Households are estimated
          per community request.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? (
          <div role="img" aria-label={rows.map((r) => `${r.label}: ${fmtNum(r.value)} ${r.unit}`).join('. ')}>
            <ResponsiveContainer width="100%" height={rows.length * 40 + 8}>
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 96, left: 0, bottom: 4 }} barCategoryGap="30%">
                {/* At least 1, so a period where nobody was reached still has a
                    scale to place each row's "0 children" against. */}
                <XAxis type="number" hide domain={[0, (max) => Math.max(max, 1)]} />
                <YAxis type="category" dataKey="label" width={132} axisLine={false} tickLine={false}
                  tick={{ fill: INK, fontSize: 12, fontWeight: 500 }} />
                <Tooltip cursor={BAR_CURSOR} content={<BeneficiaryTip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={14} minPointSize={3} isAnimationActive={animate}>
                  {rows.map((r) => <Cell key={r.metric} fill={r.color} />)}
                  <LabelList content={({ x, y, width, height, index }) => {
                    const r = rows[index];
                    return r ? (
                      <text x={x + width + 8} y={y + height / 2 + 4} fontSize={12} fill="var(--ink-soft)">
                        {fmtNum(r.value)} {r.unit}
                      </text>
                    ) : null;
                  }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {waiting.map(({ metric, label, stat }) => (
          <div key={metric} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{label}</span>
            {!stat ? (
              <Skeleton className="h-4 w-16" />
            ) : stat.notReady ? (
              <span className="text-xs text-muted-foreground">{stat.message || 'Not set up yet'}</span>
            ) : (
              <span className="text-xs text-brand">Couldn't load</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
