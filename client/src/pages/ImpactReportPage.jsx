// ─────────────────────────────────────────────────────────────
// client/src/pages/ImpactReportPage.jsx
//
// A purpose-built view for the two impactOnly metrics reportCatalog.js
// already defines (children_reached, meals_enabled) — both fully
// implemented server-side (reporting.repository.js) before this page
// existed; a manager could only reach them by knowing to pick the
// right metric out of ReportingPage.jsx's full fifteen-item catalog.
// This is what the Test Cases doc's own project goal calls "on-demand
// impact reporting" — its own screen, not one more dropdown option.
//
// NFR-20: impact reporting covers ECDs and soup kitchens only —
// enforced server-side (impactClause in reporting.repository.js),
// not repeated here as a client-side filter.
//
// meals_enabled needs a kg_to_meals row in reporting_factors before
// it returns anything — see MISSING_FACTOR below. That is a real
// operational number (kilograms per meal) nobody here can invent; it
// has to come from the NGO.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import ReportChart    from '../features/reporting/components/ReportChart';
import { runReport }  from '../services/reportingAPI';
import { RANGE_PRESETS, DEFAULT_PRESET, resolvePreset } from '../features/reporting/dateRanges';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const DIMENSION_LABELS = {
  none: 'Total', month: 'Month', week: 'Week',
  cohort: 'Cohort', ecd_centre: 'Beneficiary', beneficiary: 'Beneficiary type',
};

const MISSING_FACTOR_STATUS = 503;

const ImpactPanel = ({ title, metric, dimensions, defaultDimension }) => {
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [dimension, setDimension] = useState(defaultDimension);
  const [report, setReport] = useState(null);
  const [missingFactor, setMissingFactor] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setMissingFactor(false);
    try {
      const res = await runReport({
        metric, dimension, filters: {}, dateRange: resolvePreset(preset),
      });
      setReport(res.data ?? res);
    } catch (err) {
      if (err.status === MISSING_FACTOR_STATUS) setMissingFactor(true);
      else setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [metric, dimension, preset]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>{title}</CardTitle>
        <div className="flex gap-2">
          <Select value={dimension} onValueChange={setDimension}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {dimensions.map((d) => (
                <SelectItem key={d} value={d}>{DIMENSION_LABELS[d] ?? d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : missingFactor ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            This needs a kilograms-to-meals conversion factor on record before it can show a
            number — ask whoever manages the reporting settings to set one.
          </p>
        ) : error ? (
          <p className="rounded-[4px] border-2 border-[#ef3a40] bg-[#fff4f2] p-3 text-sm">{error}</p>
        ) : report ? (
          <>
            <p className="mb-3 text-sm text-muted-foreground">{report.description}</p>
            <ReportChart report={report} dimensionLabel={DIMENSION_LABELS[dimension] ?? dimension} />
            {report.meta?.caveat ? (
              <p className="mt-3 text-xs text-muted-foreground">{report.meta.caveat}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No data for this range yet.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default function ImpactReportPage() {
  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-medium">Impact Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ECDs and soup kitchens only — dignity kitchens don't require an impact report
          (confirmed in the project's own visit notes).
        </p>

        <div className="mt-6 space-y-6">
          <ImpactPanel
            title="Children reached"
            metric="children_reached"
            dimensions={['none', 'month', 'cohort', 'ecd_centre']}
            defaultDimension="month"
          />
          <ImpactPanel
            title="Meals enabled"
            metric="meals_enabled"
            dimensions={['none', 'month', 'week', 'cohort', 'beneficiary']}
            defaultDimension="month"
          />
        </div>
      </main>
    </ManagerLayout>
  );
}
