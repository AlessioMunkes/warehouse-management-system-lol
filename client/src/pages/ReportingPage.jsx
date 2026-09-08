// ─────────────────────────────────────────────────────────────
// client/src/pages/ReportingPage.jsx
//
// Reporting and Analytics. Manager view only — App.jsx gates the
// route, and every /api/reporting endpoint is
// requireRole(MANAGER, ADMIN).
//
// THE ASK BOX SITS ABOVE THE BUILDER, NOT INSTEAD OF IT
// A manager opening the page to check a standing figure should not
// have to type anything. The ask box is a faster way to REACH the
// builder, and every AI answer stays one click from being adjusted
// by hand. It renders only when catalog.aiEnabled is true, so when
// the API key lapses after handover the input disappears and the
// dropdowns carry on.
//
// THE RESOLVED-SPEC LINE IS THE TRUST MECHANISM
// Every result restates, in plain English, the question that was
// actually answered — generated server-side, so the AI path and the
// dropdown path describe a spec identically. A question the model
// misreads is visible before anyone acts on the number.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import { Skeleton } from '@/components/ui/skeleton';
import AskBox        from '../features/reporting/components/AskBox';
import ReportBuilder from '../features/reporting/components/ReportBuilder';
import ReportChart   from '../features/reporting/components/ReportChart';
import DataUpload   from '../features/reporting/components/DataUpload';
import { resolvePreset, DEFAULT_PRESET } from '../features/reporting/dateRanges';
import { getCatalog, runReport } from '../services/reportingAPI';

const CHARCOAL = '#2b3336';
const MUTED    = '#676767';
const BORDER   = '#e9e3dd';

export default function ReportingPage() {
  const [catalog, setCatalog]     = useState(null);
  const [metricId, setMetricId]   = useState(null);
  const [dimension, setDimension] = useState('none');
  const [preset, setPreset]       = useState(DEFAULT_PRESET);
  const [filters, setFilters]     = useState({});

  const [report, setReport] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);

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

  // An AI answer syncs the builder to the spec it produced, so
  // "change filters" means adjusting the question that was actually
  // answered rather than starting over.
  const handleAIReport = (aiReport) => {
    setReport(aiReport);
    setError(null);
    if (aiReport.spec) {
      setMetricId(aiReport.spec.metric);
      setDimension(aiReport.spec.dimension);
      setFilters(aiReport.spec.filters ?? {});
    }
  };

  // Run the first report automatically once the catalog lands, so
  // the page opens with something on it. Render's free tier
  // cold-starts, and a blank screen while it wakes reads as broken.
  useEffect(() => {
    if (catalog && metricId && !report && !busy && !error) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, metricId]);

  const metric = catalog?.metrics.find((m) => m.id === metricId);
  const dimensionLabel =
    metric?.dimensions.find((d) => d.id === dimension)?.label ?? 'Category';

  return (
    <ManagerLayout>
      <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto text-[#2b3336] font-['Montserrat',sans-serif]">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">Reporting and analytics</h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            Figures come from what was recorded at the gate, not what was planned.
          </p>
        </header>

        {!catalog && !error && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[4px]" />
            <Skeleton className="h-40 w-full rounded-[4px]" />
          </div>
        )}

        {catalog?.aiEnabled && (
          <div className="mb-4">
            <AskBox onReport={handleAIReport} />
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
            <span aria-hidden="true" className="mr-2 font-bold text-[#ef3a40]">!</span>
            {error}
          </div>
        )}

        {busy && !report && <Skeleton className="mt-5 h-64 w-full rounded-[4px]" />}

        {report && (
          <section className="mt-5 rounded-[4px] border-2 bg-white p-4 sm:p-5"
                   style={{ borderColor: BORDER }}>

            <p className="text-sm font-medium" style={{ color: CHARCOAL }}>
              {report.description}
            </p>

            <div className="mt-4">
              <ReportChart report={report} dimensionLabel={dimensionLabel} />
            </div>

            <footer className="mt-5 space-y-1 border-t pt-3 text-xs"
                    style={{ borderColor: BORDER, color: MUTED }}>
              {report.meta?.caveat && <p>{report.meta.caveat}</p>}

              {/* A filter the chosen report cannot apply means the
                  answer is broader than the question. Say so. */}
              {report.meta?.droppedFilters && (
                <p>
                  This report cannot be filtered by {report.meta.droppedFilters.join(', ')},
                  so those were ignored.
                </p>
              )}

              {report.meta?.excludedLines > 0 && (
                <p>
                  {report.meta.excludedLines} dispatch line
                  {report.meta.excludedLines === 1 ? '' : 's'} excluded — not measured in kilograms.
                </p>
              )}

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
        <div className="mt-6">
          <DataUpload />
        </div>

      </main>
    </ManagerLayout>
  );
}
