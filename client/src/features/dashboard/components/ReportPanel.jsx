// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/components/ReportPanel.jsx
//
// A dashboard chart that is an Operations report underneath: the
// same POST /api/reporting/report, drawn by the Operations page's own
// Recharts chart (OperationalChart) in its compact form, with the
// same --viz palette. So the figure on the dashboard is the figure on
// the reporting page, and it looks like it too.
//
// PERIOD
// `period` is the widget's Month / 3 months / Year choice (see
// chartTheme.js). A trend shown by month over a single month is one
// bar, so over a month a trend drops to weeks where the report has
// them (`weekly` on the widget).
//
// THE BUG THIS ONCE FIXED
// The dashboard used to read `result.data`. The reporting rework
// renamed that to `series`, the old field came back undefined, and
// "Most dispatched products" read "Nothing dispatched yet" with 43 kg
// out of the door. unwrapReport reads `series`, in one place.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import OperationalChart from '../../reporting/components/OperationalChart';
import { runReport, getTargets } from '../../../services/reportingAPI';
import { resolvePreset } from '../../reporting/dateRanges';
import { STAFF } from '../../../routes/paths';
import { periodById, unwrapReport, ragAgainst } from '../chartTheme';
// The --viz-1…8 palette the Operations charts are drawn in.
import '../../reporting/operationalReport.css';

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 4;
const RETRY_MS = 3000;

// The manager's targets (their own, or each report's default), fetched
// once per page load and shared by every panel that colours against
// them. A failure just means no colours and no target line.
let targetsOnce = null;
const loadTargets = () => {
  targetsOnce ??= Promise.resolve().then(() => getTargets()).then((res) => res?.data ?? res ?? {}).catch(() => ({}));
  return targetsOnce;
};

function useTarget(metric, wanted) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    if (!wanted) return undefined;
    let cancelled = false;
    loadTargets().then((all) => { if (!cancelled) setTarget(all?.[metric] ?? null); });
    return () => { cancelled = true; };
  }, [metric, wanted]);
  return target;
}

export default function ReportPanel({ def, period }) {
  // `rag`: colour each bar green, amber or red against its target.
  const target = useTarget(def.spec.metric, Boolean(def.rag));
  const colorFor = def.colorFor ?? (def.rag ? ragAgainst(target) : undefined);
  const p = periodById(period ?? def.defaultPeriod);
  const dimension = def.spec.dimension === 'month' && p.id === 'month' && def.weekly ? 'week' : def.spec.dimension;
  const requestKey = `${def.id}|${p.id}|${dimension}`;

  // Keyed by what was asked for, so switching the period shows the
  // loading state instead of the previous period's chart.
  const [result, setResult] = useState({ key: null, report: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let timer;
    // A server that is starting up or restarting answers 502/503 for a
    // few seconds. Try again quietly rather than leave a dead chart on
    // the board until someone refreshes.
    const load = (attempt) => {
      runReport({ filters: {}, ...def.spec, dimension, dateRange: resolvePreset(p.preset) })
        .then((res) => {
          if (cancelled) return;
          const r = unwrapReport(res);
          let series = def.top
            ? [...r.series].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, def.top)
            : r.series;
          // Status codes become plain words, and stages keep their order.
          if (def.labels) series = series.map((row) => ({ ...row, label: def.labels[row.label] ?? row.label }));
          if (def.order) {
            const at = (l) => { const i = def.order.indexOf(l); return i < 0 ? def.order.length : i; };
            series = [...series].sort((a, b) => at(a.label) - at(b.label));
          }
          setResult({ key: requestKey, report: { ...r, series }, error: null });
        })
        .catch((err) => {
          if (cancelled) return;
          if (RETRY_STATUSES.has(err.status) && attempt < MAX_RETRIES) {
            timer = setTimeout(() => load(attempt + 1), RETRY_MS);
          } else {
            setResult({ key: requestKey, report: null, error: err.message });
          }
        });
    };
    load(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [def, dimension, p.preset, requestKey]);

  if (result.key !== requestKey) return <Skeleton className="h-40 w-full" />;
  if (result.error) {
    return <p className="text-sm text-muted-foreground">This chart could not be loaded ({result.error}).</p>;
  }
  const { report } = result;
  if (report.series.length === 0) {
    return <p className="text-sm text-muted-foreground">{def.emptyText ?? 'Nothing recorded in this period yet.'}</p>;
  }

  return (
    <div>
      {/* key: a new period is a new chart — its view and highlight start fresh. */}
      <OperationalChart
        key={requestKey} report={report} hint={def.hint} compact keepOrder={Boolean(def.order)}
        colorFor={colorFor} target={def.rag && target?.value != null ? target : null}
      />
      {/* Operations reports is a manager's screen; an admin's chart has no link. */}
      {def.roles?.includes('manager') ? (
        <Link to={STAFF.reporting} className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-2">
          More in Operations reports
        </Link>
      ) : null}
    </div>
  );
}
