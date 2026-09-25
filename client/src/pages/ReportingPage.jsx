// ─────────────────────────────────────────────────────────────
// client/src/pages/ReportingPage.jsx
//
// Operations Analytics. Manager view only — App.jsx gates the
// route, and every /api/reporting endpoint is
// requireRole(MANAGER, ADMIN).
//
// OPERATIONS, NOT IMPACT.
// Beneficiary-facing numbers (children/adults served, meals enabled,
// paper saved, compost processed) live on their own Impact Calculator
// page — this one is the day-to-day running of the warehouse: what
// moved, what it cost, what broke. Keeping them apart means neither
// screen has to caveat itself around the other's audience.
//
// THE ASK BOX SITS ABOVE THE BUILDER, NOT INSTEAD OF IT
// A manager opening the page to check a standing figure should not
// have to type anything. The ask box is a faster way to REACH the
// builder, and every AI answer stays one click from being adjusted
// by hand. It renders only when catalog.aiEnabled is true, so when
// the API key lapses after handover the input disappears and the
// dropdowns carry on.
//
// TRENDS ARE A SHORTCUT INTO THE BUILDER, NOT A SEPARATE FEATURE.
// Four pre-picked metrics render small on open so the page never
// looks like an empty form waiting to be told what to look at —
// "Explore" runs that report in full (with the card's breakdown),
// syncs the builder to it and brings the result into focus. The
// "At a glance" heading folds the cards away.
//
// THE RESOLVED-SPEC LINE IS THE TRUST MECHANISM
// Every result restates, in plain English, the question that was
// actually answered — generated server-side, so the AI path and the
// dropdown path describe a spec identically. A question the model
// misreads is visible before anyone acts on the number.
//
// EVERY REPORT ENDS IN WHO TO ACT ON
// Under each result, OperationalInsight shows the key figures (with
// the change on the previous period), the named centres, suppliers,
// products and packers behind the number with their contact details,
// and related views. A written report — model-written, or built from
// the figures when the model is unavailable — is one click away and
// prints to PDF. Impact metrics never reach it: they are filtered out
// of this page's catalog and refused by /insight on the server.
//
// CHARTS
// The result chart is OperationalChart (Recharts): the manager can
// switch how it is drawn, trim to the top few, sort, show averages and
// the working target, and click any bar or point to highlight it —
// the same item lights up in the "who to act on" lists. Scatter plots
// come from declared comparisons (Browse all reports, or a question
// like "scatter plot of centres' collections against children").
// ReportChart stays for the Impact Report page and for printing.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import { Skeleton } from '@/components/ui/skeleton';
import AskBox        from '../features/reporting/components/AskBox';
import ReportBuilder from '../features/reporting/components/ReportBuilder';
import OperationalChart from '../features/reporting/components/OperationalChart';
import ComparisonChart  from '../features/reporting/components/ComparisonChart';
import TrendCard     from '../features/reporting/components/TrendCard';
import DataUpload   from '../features/reporting/components/DataUpload';
import ReportBrowser from '../features/reporting/components/ReportBrowser';
import OperationalInsight from '../features/reporting/components/OperationalInsight';
import { resolvePreset, DEFAULT_PRESET } from '../features/reporting/dateRanges';
import { getCatalog, runReport, getComparisons, runComparison, saveTarget } from '../services/reportingAPI';
import { Truck, TrendingUp, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';

const CHARCOAL = 'var(--ink)';
const MUTED    = 'var(--ink-soft)';
const BORDER   = 'var(--line)';

// Four pre-picked, genuinely useful signals — not an exhaustive list
// (the builder below has all eighteen), just the ones worth seeing
// without asking. unit_price_trend covers "prices"; there is no
// substitute-goods metric here because nothing in the schema tracks
// product substitution — inventing one would be a chart with no real
// data behind it, which is worse than not showing it.
const TRENDS = [
  { metricId: 'dispatch_volume',   label: 'Food dispatched',       icon: Truck,         dimension: 'month' },
  { metricId: 'unit_price_trend',  label: 'Unit price trend',      icon: TrendingUp,    dimension: 'product' },
  { metricId: 'collection_compliance', label: 'Collection compliance', icon: CheckCircle2, dimension: 'month' },
  { metricId: 'low_stock_items',   label: 'Items below reorder level', icon: AlertTriangle, dimension: 'product' },
];

export default function ReportingPage() {
  const [catalog, setCatalog]     = useState(null);
  const [metricId, setMetricId]   = useState(null);
  const [dimension, setDimension] = useState('none');
  const [preset, setPreset]       = useState(DEFAULT_PRESET);
  const [filters, setFilters]     = useState({});

  const [report, setReport] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [comparison, setComparison]   = useState(null);
  const [highlight, setHighlight]     = useState(null);
  const [target, setTarget]           = useState(null);

  // One way in for a new result: a fresh report clears the scatter
  // view, the old highlight and the old report's target line.
  const showReport = (next) => {
    setReport(next);
    setComparison(null);
    setHighlight(null);
    setTarget(null);
  };
  const showComparison = (next) => {
    setComparison(next);
    setReport(null);
    setHighlight(null);
    setTarget(null);
    setError(null);
  };

  useEffect(() => {
    let cancelled = false;
    getComparisons()
      .then((res) => { if (!cancelled) setComparisons(res.data ?? res); })
      .catch(() => { /* comparisons are optional; the page works without them */ });
    return () => { cancelled = true; };
  }, []);

  const runComparisonById = async (id) => {
    setBusy(true);
    setError(null);
    focusResult();
    try {
      const res = await runComparison(id, resolvePreset(preset));
      showComparison(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const builderRef = useRef(null);

  // FOCUS ON THE ANSWER
  // Explore, an ask-box answer, Browse all reports and a comparison
  // all bring the result into view and move keyboard focus to it, so
  // a manager never has to hunt down the page for what they asked.
  // Scroll once straight away (the loading placeholder sits at the
  // same spot) and again when the result has rendered.
  const resultRef = useRef(null);
  const pendingFocus = useRef(false);
  const focusResult = () => {
    pendingFocus.current = true;
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (!pendingFocus.current || !(report || comparison || error)) return;
    pendingFocus.current = false;
    const el = resultRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, [report, comparison, error]);

  // The trend cards can be folded away; remembered per browser.
  // Storage can be blocked (private windows), so it is best effort.
  const [trendsOpen, setTrendsOpen] = useState(() => {
    try { return localStorage.getItem('op-trends-collapsed') !== '1'; } catch { return true; }
  });
  const toggleTrends = () => {
    setTrendsOpen((open) => {
      try { localStorage.setItem('op-trends-collapsed', open ? '1' : '0'); } catch { /* not kept */ }
      return !open;
    });
  };

  useEffect(() => {
    let cancelled = false;
    getCatalog()
      .then(async (res) => {
        if (cancelled) return;
        const data = res.data ?? res;
        // Impact metrics (children/adults reached, meals enabled, paper
        // saved, compost processed) are excluded here, not just styled
        // differently — this page is Operations Analytics, and those
        // five belong on the Impact Calculator page. Filtering at the
        // one place this catalog is stored means every consumer below
        // (the dropdown, the auto-selected first metric) inherits the
        // exclusion for free rather than each having to remember it.
        const operational = { ...data, metrics: data.metrics.filter((m) => !m.impactOnly) };
        setCatalog(operational);
        const first = operational.metrics[0];
        if (first) {
          setMetricId(first.id);
          setDimension(first.dimensions[0].id);
          setBusy(true);
          try {
            const reportRes = await runReport({
              metric: first.id,
              dimension: first.dimensions[0].id,
              filters: {},
              dateRange: resolvePreset(DEFAULT_PRESET),
            });
            if (!cancelled) showReport(reportRes.data ?? reportRes);
          } catch (err) {
            if (!cancelled) setError(err.message);
          } finally {
            if (!cancelled) setBusy(false);
          }
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

  // A trend card's "Explore" runs its report straight away, with the
  // card's own breakdown, and brings the full result into focus — the
  // same path as Browse all reports, so the builder is synced too.
  const handleExplore = (id) => {
    const card = TRENDS.find((t) => t.metricId === id);
    runMetric(id, card?.dimension);
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
      showReport(res.data ?? res);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [metricId, dimension, filters, preset]);

  // Browse all reports, and the ask box's "closest report" button:
  // pick a metric and run it straight away with its first breakdown
  // and the current period, so one tap gives an answer, not a form.
  const runMetric = async (id, preferredDimension) => {
    const next = catalog?.metrics.find((m) => m.id === id);
    if (!next) return;
    const dim = next.dimensions.some((d) => d.id === preferredDimension)
      ? preferredDimension
      : next.dimensions[0].id;
    setMetricId(id);
    setDimension(dim);
    setFilters({});
    setBusy(true);
    setError(null);
    showReport(null);
    focusResult();
    try {
      const res = await runReport({ metric: id, dimension: dim, filters: {}, dateRange: resolvePreset(preset) });
      showReport(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // An AI answer syncs the builder to the spec it produced, so
  // "change filters" means adjusting the question that was actually
  // answered rather than starting over.
  const handleAIReport = (aiReport) => {
    focusResult();
    if (aiReport.type === 'comparison') { showComparison(aiReport); return; }
    showReport(aiReport);
    setError(null);
    if (aiReport.spec) {
      setMetricId(aiReport.spec.metric);
      setDimension(aiReport.spec.dimension);
      setFilters(aiReport.spec.filters ?? {});
    }
  };

  const metric = catalog?.metrics.find((m) => m.id === metricId);
  const dimensionLabel =
    metric?.dimensions.find((d) => d.id === dimension)?.label ?? 'Category';

  return (
    <ManagerLayout>
      <main className="px-4 sm:px-6 py-6 max-w-5xl mx-auto text-ink font-['Montserrat',sans-serif]">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">Operations analytics</h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            Figures come from what was recorded at the gate, not what was planned. Looking
            for beneficiary impact instead? See Impact Report in the sidebar.
          </p>
        </header>

        {!catalog && !error && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-[4px]" />)}
          </div>
        )}

        {catalog && (
          <section aria-labelledby="op-trends-heading">
            <h2 id="op-trends-heading" className="mb-2">
              <button
                type="button"
                onClick={toggleTrends}
                aria-expanded={trendsOpen}
                aria-controls="op-trends"
                className="flex items-center gap-2 text-sm font-bold"
              >
                <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${trendsOpen ? '' : '-rotate-90'}`} />
                At a glance
              </button>
            </h2>
            {trendsOpen && (
              <div id="op-trends" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {TRENDS.map((t) => (
                  <TrendCard key={t.metricId} {...t} onExplore={handleExplore} />
                ))}
              </div>
            )}
          </section>
        )}

        {catalog?.aiEnabled && (
          <div className="mt-6">
            <AskBox onReport={handleAIReport} onPickMetric={runMetric} />
          </div>
        )}

        {catalog && (
          <div className="mt-4">
            <ReportBrowser
              metrics={catalog.metrics} onPick={runMetric}
              comparisons={comparisons} onPickComparison={runComparisonById}
              disabled={busy}
            />
          </div>
        )}

        <div ref={builderRef} className="mt-6 scroll-mt-4">
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
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-[4px] border-2 p-4 text-sm"
            style={{ borderColor: 'var(--brand)', color: CHARCOAL }}
          >
            <span aria-hidden="true" className="mr-2 font-bold text-brand">!</span>
            {error}
          </div>
        )}

        {/* Where Explore, the ask box and Browse all reports land.
            tabIndex -1 lets focus move here without adding a tab stop. */}
        <div ref={resultRef} tabIndex={-1} aria-label="Report result" className="scroll-mt-4 outline-none" />

        {busy && !report && !comparison && <Skeleton className="mt-5 h-64 w-full rounded-[4px]" />}

        {report && (
          <section className="mt-5 rounded-[4px] border-2 bg-surface p-4 sm:p-5"
                   style={{ borderColor: BORDER }}>

            <p className="text-sm font-medium" style={{ color: CHARCOAL }}>
              {report.description}
            </p>

            <div className="mt-4">
              {/* Keyed by spec so a new report starts from its own
                  default view, or the one the AI was asked for. */}
              <OperationalChart
                key={JSON.stringify(report.spec)}
                report={report}
                dimensionLabel={dimensionLabel}
                target={target}
                hint={report.meta?.chartHint}
                highlight={highlight}
                onHighlight={setHighlight}
                onTargetChange={async (value) => {
                  const res = await saveTarget(report.spec.metric, value);
                  setTarget(res.data ?? res);
                }}
              />
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
                  {report.meta.excludedLines === 1 ? '' : 's'} excluded, not measured in kilograms.
                </p>
              )}

              {report.meta?.factor && (
                <p>
                  Converted at {report.meta.factor.value} per kg.
                  {report.meta.factor.note ? ` ${report.meta.factor.note}` : ''}
                </p>
              )}

              {report.meta?.cached && <p>Showing a recently cached result.</p>}

              {/* Every AI model was busy or out of quota, so the
                  server matched the question by its keywords. */}
              {report.meta?.matchedBy === 'keyword' && (
                <p>
                  Closest match: the AI assistant was busy, so this report was picked from the
                  words in your question. Check it answers what you asked, or adjust it above.
                </p>
              )}
            </footer>
          </section>
        )}

        {/* Keyed by spec: a different question is a fresh breakdown,
            with nothing carried over from the last one. */}
        {report && (
          <OperationalInsight
            key={JSON.stringify(report.spec)}
            report={report}
            highlight={highlight}
            onHighlight={setHighlight}
            onLoaded={(d) => setTarget(d.target ?? null)}
          />
        )}

        {comparison && (
          <section className="mt-5 rounded-[4px] border-2 bg-surface p-4 sm:p-5" style={{ borderColor: BORDER }}>
            <p className="text-sm font-medium">{comparison.description}</p>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>{comparison.about}</p>
            {comparison.matchedBy === 'keyword' && (
              <p className="mt-1 text-xs" style={{ color: MUTED }}>
                Closest match: the AI assistant was busy, so this was picked from the words in your question.
              </p>
            )}
            <div className="mt-4">
              <ComparisonChart key={comparison.description} data={comparison} />
            </div>
            {comparison.caveat && (
              <p className="mt-3 border-t pt-3 text-xs" style={{ borderColor: BORDER, color: MUTED }}>{comparison.caveat}</p>
            )}
          </section>
        )}
        <div className="mt-6">
          <DataUpload />
        </div>

      </main>
    </ManagerLayout>
  );
}
