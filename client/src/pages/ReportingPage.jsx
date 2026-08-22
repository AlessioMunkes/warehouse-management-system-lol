// ─────────────────────────────────────────────────────────────
// client/src/pages/ReportingPage.jsx
//
// Reporting and Analytics. Manager view only — App.jsx gates the
// route, and both server endpoints are requireRole(MANAGER, ADMIN).
//
// LAYOUT MIRRORS ManagerActivityScreen
// TopNavbar plus a centred main, same Montserrat/charcoal shell, so
// this reads as part of the manager dashboard rather than a new app.
//
// THE RESOLVED-SPEC LINE IS NOT DECORATION
// Every result restates, in plain English, the question that was
// actually answered — generated server-side by describeSpec(). When
// the AI ask box lands, a question the model misreads shows up here
// before anyone acts on the number. Do not remove it when the ask
// box arrives; that is when it starts earning its keep.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import { Skeleton } from '@/components/ui/skeleton';
import ReportBuilder from '../features/reporting/components/ReportBuilder';
import ReportChart   from '../features/reporting/components/ReportChart';
import { resolvePreset, DEFAULT_PRESET } from '../features/reporting/dateRanges';
import { getCatalog, runReport } from '../services/reportingAPI';

const CHARCOAL = '#2b3336';
const MUTED    = '#676767';
const BORDER   = '#e9e3dd';

export default function ReportingPage() {
  const [reducedMovement, setReducedMovement] = useState(false);

  const [catalog, setCatalog]   = useState(null);
  const [metricId, setMetricId] = useState(null);
  const [dimension, setDimension] = useState('none');
  const [preset, setPreset]     = useState(DEFAULT_PRESET);
  const [filters, setFilters]   = useState({});

  const [report, setReport] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);

  // ── Load the catalog once ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getCatalog()
      .then((res) => {
        if (cancelled) return;
        const data = res.data ?? res;
        setCatalog(data);
        const first = data.metrics?.[0];
        if (first) {
          setMetricId(first.id);
          setDimension(first.dimensions[0].id);
        }
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, []);

  // Changing metric resets the breakdown and clears filters: the new
  // metric may not accept the old dimension, and the server rejects
  // an undeclared filter rather than ignoring it.
  const handleMetricChange = (id) => {
    const next = catalog?.metrics.find((m) => m.id === id);
    setMetricId(id);
    setDimension(next?.dimensions[0].id ?? 'none');
    setFilters({});
    setReport(null);
  };

  const handleFilterChange = (key, value) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });

  const run = useCallback(async () => {
    if (!metricId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runReport({
        metric: metricId,
        dimension,
        filters,
        dateRange: resolvePreset(preset),
      });
      setReport(res.data ?? res);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [metricId, dimension, filters, preset]);

  // Run the first report automatically once the catalog lands, so the
  // page opens with something on it. Render's free tier cold-starts,
  // and a blank screen while the instance wakes reads as broken.
  useEffect(() => {
    if (catalog && metricId && !report && !busy && !error) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, metricId]);

  const metric = catalog?.metrics.find((m) => m.id === metricId);
  const dimensionLabel =
    metric?.dimensions.find((d) => d.id === dimension)?.label ?? 'Category';

  return (
    <div className="min-h-screen bg-white text-[#2b3336] font-['Montserrat',sans-serif]">
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={setReducedMovement}
      />

      <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">Reporting and analytics</h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            Figures come from what was recorded at the gate, not what was planned.
          </p>
        </header>

        {!catalog && !error && (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-[4px]" />
            <Skeleton className="h-64 w-full rounded-[4px]" />
          </div>
        )}

        {catalog && (
          <ReportBuilder
            catalog={catalog}
            metricId={metricId}
            dimension={dimension}
            preset={preset}
            filters={filters}
            onMetricChange={handleMetricChange}
            onDimensionChange={setDimension}
            onPresetChange={setPreset}
            onFilterChange={handleFilterChange}
            onRun={run}
            busy={busy}
          />
        )}

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-[4px] border-2 p-4 text-sm"
            style={{ borderColor: '#ef3a40', color: CHARCOAL }}
          >
            {/* Icon plus text, never colour alone — ACC-03. */}
            <span aria-hidden="true" className="mr-2 font-bold text-[#ef3a40]">!</span>
            {error}
          </div>
        )}

        {busy && !report && (
          <Skeleton className="mt-5 h-64 w-full rounded-[4px]" />
        )}

        {report && (
          <section className="mt-5 rounded-[4px] border-2 bg-white p-4 sm:p-5"
                   style={{ borderColor: BORDER }}>

            {/* What was actually asked. The trust mechanism. */}
            <p className="text-sm font-medium" style={{ color: CHARCOAL }}>
              {report.description}
            </p>

            <div className="mt-4">
              <ReportChart report={report} dimensionLabel={dimensionLabel} />
            </div>

            <footer className="mt-5 space-y-1 border-t pt-3 text-xs"
                    style={{ borderColor: BORDER, color: MUTED }}>
              {report.meta?.caveat && <p>{report.meta.caveat}</p>}

              {/* A total shrunk by unit mismatches is stated, not
                  silently absorbed. */}
              {report.meta?.excludedLines > 0 && (
                <p>
                  {report.meta.excludedLines} dispatch line
                  {report.meta.excludedLines === 1 ? '' : 's'} excluded — not measured in kilograms.
                </p>
              )}

              {/* Impact figures name their factor and its source, so
                  a number quoted to a funder can be defended. */}
              {report.meta?.factor && (
                <p>
                  Converted at {report.meta.factor.value} per kg.
                  {report.meta.factor.note ? ` ${report.meta.factor.note}` : ''}
                </p>
              )}

              {report.meta?.cached && <p>Showing a recently cached result.</p>}
            </footer>
          </section>
        )}
      </main>
    </div>
  );
}
