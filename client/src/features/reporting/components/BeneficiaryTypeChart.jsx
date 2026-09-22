// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/BeneficiaryTypeChart.jsx
//
// A different question from any single metric on this page: not
// "how much of X" but "who did the warehouse reach this period,
// broken down by beneficiary type." Children is a real headcount;
// adults/dignity-kitchen guests/community requests are all estimates
// converted from kilograms dispatched, each at its own manager-set
// factor — mixing a real count with three estimates in one chart
// would be dishonest without saying so, so every row prints its own
// unit rather than pretending they're the same kind of number.
//
// Not built on ReportChart — that component draws one metric's own
// dimension breakdown; this draws four different metrics' totals
// side by side, which is a different shape entirely.
// ─────────────────────────────────────────────────────────────
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function BeneficiaryTypeChart({ items }) {
  const max = Math.max(
    ...items
      .map((i) => i.stat)
      .filter((s) => s && !s.notReady && !s.error)
      .map((s) => s.value),
    1
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Beneficiaries by type</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Who the warehouse reached this period. Children is a real headcount; the rest are
          estimates converted from kilograms dispatched.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map(({ metric, label, unit, color, stat }) => (
          <div key={metric}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{label}</span>
              {!stat ? (
                <Skeleton className="h-4 w-16" />
              ) : stat.notReady ? (
                <span className="text-xs text-muted-foreground">{stat.message || 'Not set up yet'}</span>
              ) : stat.error ? (
                <span className="text-xs text-[#ef3a40]">Couldn't load</span>
              ) : (
                <span className="text-muted-foreground">
                  {Math.round(stat.value).toLocaleString('en-ZA')} {unit}
                </span>
              )}
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#f7f4ef]">
              {stat && !stat.notReady && !stat.error ? (
                <div
                  className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
                  style={{ width: `${Math.max((stat.value / max) * 100, 3)}%`, backgroundColor: color }}
                />
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
