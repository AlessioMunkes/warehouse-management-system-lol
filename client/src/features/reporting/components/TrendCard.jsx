// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/TrendCard.jsx
//
// One curated, pre-picked metric shown small — this month's
// dispatch volume, this month's unit price trend, and so on — so the
// Operations Analytics page opens with a handful of the numbers a
// manager actually checks, rather than an empty builder waiting to
// be told what to look at. "Explore" hands the same metric to the
// full report builder below for anyone who wants to slice it further.
//
// Self-contained and independent, same shape as ImpactReportPage.jsx's
// ImpactPanel — each card fetches its own data so one slow or missing
// metric cannot block the others from rendering.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { runReport } from '../../../services/reportingAPI';
import { resolvePreset } from '../dateRanges';
// OperationalChart, not ReportChart: these cards only appear on the
// Operations page, and its chart colours follow light and dark mode.
import OperationalChart from './OperationalChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function TrendCard({ metricId, label, icon: Icon, dimension = 'month', preset = 'last_3m', onExplore }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await runReport({
          metric: metricId, dimension, filters: {}, dateRange: resolvePreset(preset),
        });
        if (!cancelled) setReport(res.data ?? res);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [metricId, dimension, preset]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {Icon ? <Icon className="size-4" /> : null}
          {label}
        </CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => onExplore?.(metricId)}>
          Explore
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : error ? (
          <p className="text-xs text-brand">{error}</p>
        ) : report && report.series?.length ? (
          <OperationalChart report={report} dimensionLabel={label} compact />
        ) : (
          <p className="text-xs text-muted-foreground">No data for this range yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
