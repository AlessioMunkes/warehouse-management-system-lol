// ─────────────────────────────────────────────────────────────
// client/src/pages/ReportingPage.jsx
//
// Operations Reports (managers and admins). The day-to-day running of the
// warehouse; beneficiary impact figures are on the Impact Report page.
//
// From top to bottom: saved reports, "At a glance" trend cards, the ask
// box (hidden if no AI key is set), Browse all reports, and the builder
// (prepared or custom report). Every answer shows the question it
// actually answered in plain words, plus "Not what you meant? Try:"
// alternatives.
//
// Under a result: compare with last year, drill into a bar, save the
// report, and Generate report (see OperationalInsight). Scatter
// comparisons have their own chart and report.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ErrorBanner from '@/components/ui/error-banner';
import { Skeleton } from '@/components/ui/skeleton';
import AskBox        from '../features/reporting/AskBox';
import ReportBuilder from '../features/reporting/ReportBuilder';
import OperationalChart from '../features/reporting/OperationalChart';
import ComparisonInsight from '../features/reporting/ComparisonInsight';
import OverviewCards from '../features/reporting/OverviewCards';
import { useAuth } from '../context/AuthContext';
import DataUpload   from '../features/reporting/DataUpload';
import ReportBrowser from '../features/reporting/ReportBrowser';
import OperationalInsight from '../features/reporting/OperationalInsight';
import CustomReportBuilder from '../features/reporting/CustomReportBuilder';
import { defaultCustom } from '../features/reporting/customSpec';
import { shapeOf, yearEarlier } from '../features/reporting/chartFormat';
import { resolvePreset, DEFAULT_PRESET, todaySAST } from '../features/reporting/dateRanges';
import { getCatalog, runReport, getComparisons, runComparison, saveTarget, drillDown, getSaved, getFilterOptions } from '../services/reportingAPI';
import RecordsPanel from '../features/reporting/RecordsPanel';
import ProcessMap from '../features/reporting/ProcessMap';
import ReorderPlanner from '../features/reporting/ReorderPlanner';
import ExceptionAlerts from '../features/reporting/ExceptionAlerts';
import { SavedReportsBar, SaveReport } from '../features/reporting/SavedReports';
import ChartNote from '../features/reporting/ChartNote';
import {
  CHARCOAL, BORDER, Alternatives, ReportDrill, ReportNotes, ComparisonCard,
} from '../features/reporting/ReportResultParts';

// The page in seven parts, switched with the tabs under the title the
// way Receipts switches goods in and goods out. Anything that produces
// a report (a card's Explore, a saved report) lands on Reports.
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'reports',  label: 'Reports' },
  { id: 'process',  label: 'Process map' },
  { id: 'reorder',  label: 'Reorder planner' },
  { id: 'alerts',   label: 'Exception alerts' },
  { id: 'upload',   label: 'Chart a spreadsheet' },
];

export default function ReportingPage() {
  const { user } = useAuth();
  const [catalog, setCatalog]     = useState(null);
  const [tab, setTab]             = useState('overview');
  // The process map and the spreadsheet chart are drawn once their tab
  // has been opened and kept after that, so coming back to one finds
  // the filters, the chosen step or the dropped file as it was left.
  const [opened, setOpened]       = useState({});
  const changeTab = (id) => { setTab(id); setOpened((o) => (o[id] ? o : { ...o, [id]: true })); };
  const [metricId, setMetricId]   = useState(null);
  const [dimension, setDimension] = useState('none');
  const [preset, setPreset]       = useState(DEFAULT_PRESET);
  const [filters, setFilters]     = useState({});
  // "Custom range" in the period menu: any two dates.
  const [customRange, setCustomRange] = useState(null);
  const rangeFor = () => (preset === 'custom' && customRange?.from && customRange?.to ? customRange : resolvePreset(preset));
  // Suppliers, products, centres and recorded statuses, for the filters.
  const [filterOptions, setFilterOptions] = useState({});
  // The records behind the report on screen, or one bar of it.
  const [recordsFor, setRecordsFor] = useState(null);
  // Prepared report or custom "how many X by Y" — see CustomReportBuilder.
  const [mode, setMode]           = useState('prepared');
  const [custom, setCustom]       = useState(null);

  const [report, setReport] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [comparison, setComparison]   = useState(null);
  const [highlight, setHighlight]     = useState(null);
  const [target, setTarget]           = useState(null);
  // The same report a year earlier, drawn behind a time chart.
  const [lastYear, setLastYear]       = useState(null);
  const [lastYearBusy, setLastYearBusy] = useState(false);
  // Drill-down: the reports above this one, newest last, for "Back".
  const [drillStack, setDrillStack]   = useState([]);
  const [drillBusy, setDrillBusy]     = useState(false);
  const [saved, setSaved]             = useState([]);
  const loadSaved = useCallback(() => getSaved()
    .then((res) => setSaved(res.data ?? res ?? []))
    .catch(() => { /* saved reports are optional; the page works without them */ }), []);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  // One way in for a new result: a fresh report clears the scatter
  // view, the old highlight and the old report's target line.
  // The written report for the chart on screen, keyed by its spec: the one
  // "Generate report" wrote (saved with the report when it is saved), and
  // the one a saved report brought back with it.
  const [writeUp, setWriteUp] = useState(null);          // { key, narrative }
  const [savedWriteUp, setSavedWriteUp] = useState(null); // { key, narrative, writtenAt, range }
  const specKey = report ? JSON.stringify(report.spec) : null;

  const showReport = (next, { keepDrill = false } = {}) => {
    setReport(next);
    setSavedWriteUp(null);
    setRecordsFor(null);
    setComparison(null);
    setHighlight(null);
    setTarget(null);
    setLastYear(null);
    if (!keepDrill) setDrillStack([]);
  };

  const drillInto = async (label, target) => {
    if (!report || !label) return;
    setDrillBusy(true);
    setError(null);
    try {
      const res = await drillDown(report.spec, label, target);
      setDrillStack((s) => [...s, report]);
      showReport(res.data ?? res, { keepDrill: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setDrillBusy(false);
    }
  };
  const drillBack = () => {
    const parent = drillStack[drillStack.length - 1];
    if (!parent) return;
    setDrillStack((s) => s.slice(0, -1));
    showReport(parent, { keepDrill: true });
  };

  const toggleLastYear = async () => {
    if (lastYear) { setLastYear(null); return; }
    const range = yearEarlier(report?.spec?.dateRange);
    if (!range) return;
    setLastYearBusy(true);
    try {
      const res = await runReport(report.spec.custom
        ? { custom: report.spec.custom, dateRange: range }
        : { metric: report.spec.metric, dimension: report.spec.dimension, filters: report.spec.filters ?? {}, dateRange: range });
      setLastYear(res.data ?? res);
    } catch (err) {
      setError(`Could not load last year: ${err.message}`);
    } finally {
      setLastYearBusy(false);
    }
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

  const runComparisonById = async (id, range) => {
    setBusy(true);
    setError(null);
    focusResult();
    try {
      const res = await runComparison(id, range ?? rangeFor());
      showComparison(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const builderRef = useRef(null);

  // A saved report opens over its own period.
  const openSaved = async (s) => {
    const range = resolvePreset(s.preset);
    setPreset(s.preset);
    setBusy(true);
    setError(null);
    focusResult();
    try {
      if (s.kind === 'comparison') {
        const res = await runComparison(s.spec.comparison, range);
        showComparison(res.data ?? res);
        return;
      }
      const res = await runReport(s.kind === 'custom' ? { custom: s.spec.custom, dateRange: range } : { ...s.spec, dateRange: range });
      const next = res.data ?? res;
      showReport(next);
      if (s.narrative) {
        setSavedWriteUp({
          key: JSON.stringify(next.spec), narrative: s.narrative,
          writtenAt: s.narrative_at, range: s.narrative_range,
        });
      }
      if (s.kind === 'custom') { setMode('custom'); setCustom(s.spec.custom); }
      else { setMode('prepared'); setMetricId(s.spec.metric); setDimension(s.spec.dimension); setFilters(s.spec.filters ?? {}); }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runCustomSpec = async (spec, range) => {
    setMode('custom');
    setCustom(spec);
    setBusy(true);
    setError(null);
    focusResult();
    try {
      const res = await runReport({ custom: spec, dateRange: range ?? rangeFor() });
      showReport(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // An alternative answers the same question, so it covers the same
  // days as the answer it replaces: asked about today, it stays today.
  const pickAlternative = (a) => {
    const range = (report ?? comparison)?.spec?.dateRange ?? comparison?.dateRange ?? undefined;
    if (a.kind === 'comparison') return runComparisonById(a.id, range);
    if (a.kind === 'custom') return runCustomSpec(a.custom, range);
    setMode('prepared');
    return runMetric(a.id, undefined, range);
  };

  // FOCUS ON THE ANSWER
  // Explore, an ask-box answer, Browse all reports and a comparison
  // all bring the result into view and move keyboard focus to it, so
  // a manager never has to hunt down the page for what they asked.
  // Scroll once straight away (the loading placeholder sits at the
  // same spot) and again when the result has rendered.
  const resultRef = useRef(null);
  const pendingFocus = useRef(false);
  const focusResult = () => {
    setTab('reports');
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

  // The filter choices load on their own: a slow or failed list leaves
  // those filters out, it does not hold up the page.
  useEffect(() => {
    let cancelled = false;
    getFilterOptions()
      .then((res) => { if (!cancelled) setFilterOptions(res.data ?? res ?? {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
  // A card on the overview opens as the same report, breakdown and
  // period, in full on the Reports tab.
  const handleExplore = (card) => {
    setPreset(card.preset);
    runMetric(card.metric, card.dimension, resolvePreset(card.preset));
  };

  const handleFilterChange = (key, value) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });

  const run = useCallback(async () => {
    if (mode === 'prepared' && !metricId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runReport(mode === 'custom'
        ? { custom: custom ?? defaultCustom(catalog.datasets[0]), dateRange: rangeFor() }
        : {
            metric: metricId,
            dimension,
            filters,
            dateRange: rangeFor(),
          });
      showReport(res.data ?? res);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [mode, custom, catalog, metricId, dimension, filters, preset, customRange]);

  // Browse all reports, and the ask box's "closest report" button:
  // pick a metric and run it straight away with its first breakdown
  // and the current period, so one tap gives an answer, not a form.
  const runMetric = async (id, preferredDimension, range) => {
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
      const res = await runReport({ metric: id, dimension: dim, filters: {}, dateRange: range ?? rangeFor() });
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
    if (aiReport.spec?.custom) {
      // A custom answer: show it in the custom builder, ready to adjust.
      setMode('custom');
      setCustom(aiReport.spec.custom);
    } else if (aiReport.spec) {
      setMode('prepared');
      setMetricId(aiReport.spec.metric);
      setDimension(aiReport.spec.dimension);
      setFilters(aiReport.spec.filters ?? {});
    }
  };

  const metric = catalog?.metrics.find((m) => m.id === metricId);
  const dimensionLabel = report?.meta?.custom
    ? (report.meta.groupLabels?.[0] ?? 'Category')
    : metric?.dimensions.find((d) => d.id === dimension)?.label ?? 'Category';

  return (
    <PageShell>
      <PageHeader
        className="mb-4"
        title="Operations reports"
        description="Ask a question or browse the warehouse’s reports."
      />

      <ViewTabs className="mb-5" label="Operations reports" value={tab} onChange={changeTab} tabs={TABS} />

      {tab === 'overview' && (<>
      {!catalog && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
        </div>
      )}

      {catalog && <OverviewCards user={user} metrics={catalog.metrics} onExplore={handleExplore} />}

      <SavedReportsBar items={saved} onOpen={openSaved} onChanged={loadSaved} />
      <ErrorBanner className="mt-5" message={error} />
      </>)}

      {tab === 'reports' && (<>
      {catalog?.aiEnabled && (
        <div>
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
        {catalog?.datasets?.length > 0 && (
          <ViewTabs
            className="mb-4"
            label="Kind of report"
            value={mode}
            onChange={(id) => { setMode(id); if (id === 'custom' && !custom) setCustom(defaultCustom(catalog.datasets[0])); }}
            tabs={[{ id: 'prepared', label: 'Prepared report' }, { id: 'custom', label: 'Custom report' }]}
          />
        )}
        {catalog && mode === 'custom' && catalog.datasets?.length > 0 && (
          <div className="rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4 sm:p-5">
            <CustomReportBuilder
              datasets={catalog.datasets}
              value={custom ?? defaultCustom(catalog.datasets[0])}
              preset={preset}
              onChange={setCustom}
              onPresetChange={setPreset}
              onRun={run}
              busy={busy}
            />
          </div>
        )}
        {catalog && mode === 'prepared' && (
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
            filterOptions={filterOptions}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            today={todaySAST()}
          />
        )}
      </div>

      <ErrorBanner className="mt-5" message={error} />

      {/* Where Explore, the ask box and Browse all reports land.
          tabIndex -1 lets focus move here without adding a tab stop. */}
      <div ref={resultRef} tabIndex={-1} aria-label="Report result" className="scroll-mt-4 outline-none" />

      {busy && !report && !comparison && <Skeleton className="mt-5 h-64 w-full rounded-lg" />}

      {report && (
        <section className="mt-5 rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4 sm:p-5"
                 style={{ borderColor: BORDER }}>

          {drillStack.length > 0 && (
            <button type="button" onClick={drillBack}
              className="mb-2 text-xs font-medium underline underline-offset-2" style={{ color: CHARCOAL }}>
              ← Back to {drillStack[drillStack.length - 1].description}
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium" style={{ color: CHARCOAL }}>
              {report.description}
            </p>
            <ChartNote note={report.meta?.caveat} />
          </div>
          <ReportDrill
            report={report}
            highlight={highlight}
            drillBusy={drillBusy}
            onDrill={drillInto}
            onRecords={setRecordsFor}
          />
          {recordsFor && (
            <RecordsPanel spec={recordsFor.spec} label={recordsFor.label} onClose={() => setRecordsFor(null)} />
          )}

          {shapeOf(report) === 'time' && report.spec?.dateRange && (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs" style={{ color: CHARCOAL }}>
              <input type="checkbox" checked={Boolean(lastYear)} disabled={lastYearBusy} onChange={toggleLastYear} />
              {lastYearBusy ? 'Loading last year…' : 'Compare with the same period last year'}
            </label>
          )}

          <div className="mt-4">
            {/* Keyed by spec so a new report starts from its own
                default view, or the one the AI was asked for. */}
            <OperationalChart
              key={JSON.stringify(report.spec)}
              report={report}
              compare={lastYear}
              dimensionLabel={dimensionLabel}
              target={target}
              hint={report.meta?.chartHint}
              highlight={highlight}
              onHighlight={setHighlight}
              // Targets belong to prepared reports; a custom one has none.
              onTargetChange={report.meta?.custom ? undefined : async (value) => {
                const res = await saveTarget(report.spec.metric, value);
                setTarget(res.data ?? res);
              }}
            />
          </div>

          <div className="mt-4">
            <SaveReport key={JSON.stringify(report.spec)}
              kind={report.spec?.custom ? 'custom' : 'report'}
              spec={report.spec?.custom ? { custom: report.spec.custom } : { metric: report.spec?.metric, dimension: report.spec?.dimension, filters: report.spec?.filters ?? {} }}
              defaultTitle={report.description?.replace(/,? \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/, '')}
              preset={preset === 'custom' ? 'last_3m' : preset} onSaved={loadSaved}
              narrative={writeUp?.key === specKey ? writeUp.narrative : (savedWriteUp?.key === specKey ? savedWriteUp.narrative : null)}
              narrativeRange={writeUp?.key === specKey ? report.spec?.dateRange : savedWriteUp?.range} />
          </div>

          <ReportNotes meta={report.meta} />
        </section>
      )}

      {report && (
        <Alternatives items={report.alternatives} onPick={pickAlternative} closest={report.meta?.matchedBy === 'keyword'} />
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
          saved={savedWriteUp?.key === specKey ? savedWriteUp : null}
          onNarrative={(narrative) => setWriteUp({ key: specKey, narrative })}
        />
      )}

      {comparison && (
        <ComparisonCard comparison={comparison} preset={preset} onSaved={loadSaved} />
      )}
      {/* Keyed like the chart, so a new comparison starts without the
          last one's report. */}
      {comparison && (
        <Alternatives items={comparison.alternatives} onPick={pickAlternative} closest={comparison.matchedBy === 'keyword'} />
      )}
      {comparison && <ComparisonInsight key={comparison.description} comparison={comparison} />}
      </>)}

      {opened.process && (
        <div hidden={tab !== 'process'}>
          <ProcessMap suppliers={filterOptions.supplier_id ?? []} />
        </div>
      )}

      {opened.reorder && (
        <div hidden={tab !== 'reorder'}>
          <ReorderPlanner />
        </div>
      )}

      {/* A flagged measure opens as its weekly report on the Reports tab. */}
      {opened.alerts && (
        <div hidden={tab !== 'alerts'}>
          <ExceptionAlerts onOpenReport={(id) => runMetric(id, 'week')} />
        </div>
      )}

      {opened.upload && (
        <div hidden={tab !== 'upload'}>
          <DataUpload />
        </div>
      )}

    </PageShell>
  );
}
