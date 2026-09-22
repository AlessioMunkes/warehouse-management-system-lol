// ─────────────────────────────────────────────────────────────
// client/src/pages/ImpactReportPage.jsx
//
// The Impact Calculator — the headline view for the four numbers the
// org actually shows people (paper saved, children served, adults
// served, compost processed), plus the detailed breakdowns
// (children_reached, meals_enabled) reportCatalog.js already fully
// implements. Both live on one screen because they answer the same
// underlying question at two different resolutions: "what did we
// achieve" and "here's exactly how that breaks down."
//
// NFR-20 / dignity kitchens: adults served is deliberately scoped to
// soup kitchens only (reporting.repository.js's adultsReached forces
// beneficiary_kind='soup_kitchen'). Dignity kitchens stay outside
// impact reporting entirely, per the project's own visit notes.
//
// PAPER SAVED IS REAL DATA, NOT AN ESTIMATE.
// It counts rows already in delivery_notes, dispatch_events and
// decanting_records — no new instrumentation, no factor, cannot 503.
//
// CHILDREN/ADULTS SERVED AND MEALS ENABLED CAN 503.
// They need a reporting_factors row (kg_to_meals / kg_to_adults_served)
// that has to come from the organisation — see MISSING_FACTOR_STATUS
// below. The "Adjust factors" dialog on this page is the real, live
// way to set one, rather than a gap only fixable by hand-editing SQL.
//
// COMPOST PROCESSED READS FROM collection_kits.
// A genuinely new, minimal table — see
// server/src/repositories/collectionKit.repository.js. The real
// logging mechanism (log a kit out, mark it returned) lives on its
// own staff module page, FeedTheSoilPage.jsx — a warehouse-floor
// action belongs with Donation Intake and Benevolent Requests, not
// buried in a dialog on a manager-facing reporting screen. This page
// only links to it and reads the number it produces.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import ReportChart    from '../features/reporting/components/ReportChart';
import ImpactStatCard from '../features/reporting/components/ImpactStatCard';
import ImpactCalculatorPDF from '../features/reporting/components/ImpactCalculatorPDF';
import { runReport }  from '../services/reportingAPI';
import reportingAPI   from '../services/reportingAPI';
import { RANGE_PRESETS, DEFAULT_PRESET, resolvePreset } from '../features/reporting/dateRanges';
import { STAFF } from '../routes/paths';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Sprout, Download, Settings2 } from 'lucide-react';

const DIMENSION_LABELS = {
  none: 'Total', month: 'Month', week: 'Week',
  cohort: 'Cohort', ecd_centre: 'Beneficiary', beneficiary: 'Beneficiary type',
};

const MISSING_FACTOR_STATUS = 503;

// One fixed palette entry per headline card — a card's colour never
// changes meaning between renders, the same reasoning
// ManagerDashboardPage.jsx's DONUT_COLORS follows.
//
// Order and captions match the poster-style layout: children/adults
// on top, compost/paper below. Three of the four captions are static
// because they're facts already true of how each number is computed
// (see this file's own header note on each metric) — not filler text,
// the actual provenance. children_reached's caption is the one
// genuinely dynamic one (which month was strongest) and is filled in
// below once the monthly breakdown loads.
const STAT_DEFS = [
  {
    metric: 'children_reached', label: 'Children served',
    unit: 'children', color: '#ef3a40', image: '/images/child-bowl.svg',
  },
  {
    metric: 'adults_reached', label: 'Adults served',
    unit: 'adults', color: '#c9a86a', image: '/images/person-waving.svg',
    staticCaption: 'Soup kitchens only · estimated from kg',
  },
  {
    metric: 'compost_processed', label: 'Compost processed',
    unit: 'kg', color: '#6b8f71', image: '/images/farmer-compost.svg',
    staticCaption: 'From Feed the Soil kits returned',
  },
  {
    metric: 'paper_saved', label: 'Paper saved',
    unit: 'documents', color: '#2b3336', image: null,
    staticCaption: 'Delivery notes · dispatch · decanting',
  },
];

const FACTOR_DEFS = [
  { key: 'kg_to_meals',          label: 'Meals per kg dispatched' },
  { key: 'kg_to_adults_served',  label: 'Adults served per kg dispatched (soup kitchens)' },
];

const AdjustFactorsDialog = () => {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [savedKey, setSavedKey] = useState(null);

  const submit = async (key) => {
    const value = values[key];
    if (!value) return;
    setBusy(key); setError(null); setSavedKey(null);
    try {
      await reportingAPI.setFactor(key, { value: Number(value) });
      setSavedKey(key);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Settings2 /> Adjust factors
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conversion factors</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Meals enabled and adults served are estimated from kilograms dispatched using these
            factors. Setting a new value here does not change past reports; it adds a new
            figure that applies from today onward.
          </p>
          {FACTOR_DEFS.map((f) => (
            <div key={f.key} className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor={`factor-${f.key}`}>{f.label}</Label>
                <Input
                  id={`factor-${f.key}`} type="number" min="0" step="0.01"
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
              <Button type="button" size="sm" disabled={busy === f.key} onClick={() => submit(f.key)}>
                {busy === f.key ? 'Saving…' : savedKey === f.key ? 'Saved' : 'Save'}
              </Button>
            </div>
          ))}
          {error && <p className="text-sm text-[#ef3a40]">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

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
            This needs a conversion factor on record before it can show a number. Use
            "Adjust factors" above to set one.
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

// children_reached's month dimension comes back "YYYY-MM"
// (reporting.repository.js's bucketMonth) — a month name is what
// reads as a caption ("267 in September"), not the raw bucket key.
const monthName = (bucketKey) => {
  const [y, m] = String(bucketKey).split('-').map(Number);
  if (!y || !m) return bucketKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-ZA', { month: 'long', timeZone: 'UTC' });
};

export default function ImpactReportPage() {
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [stats, setStats] = useState({});
  const [pdfOpen, setPdfOpen] = useState(false);

  const dateRange = resolvePreset(preset);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [results, monthlyRes] = await Promise.all([
        Promise.all(STAT_DEFS.map(async (def) => {
          try {
            const res = await runReport({ metric: def.metric, dimension: 'none', filters: {}, dateRange });
            const report = res.data ?? res;
            return [def.metric, {
              value: report.total ?? 0,
              caveat: report.meta?.caveat,
              caption: def.staticCaption,
            }];
          } catch (err) {
            if (err.status === MISSING_FACTOR_STATUS) return [def.metric, { notReady: true, message: err.message }];
            return [def.metric, { error: true }];
          }
        })),
        // Children served is the one card with a dynamic caption ("267
        // in September · strongest month yet") — real, not a guess: the
        // same monthly breakdown the "Detailed breakdown" panel below
        // already fetches for this metric, just fetched here too since
        // that panel's own request is a separate component with its own
        // state. Failure here just means no caption, not a broken page —
        // the headline number itself already came back above.
        runReport({ metric: 'children_reached', dimension: 'month', filters: {}, dateRange }).catch(() => null),
      ]);

      if (cancelled) return;

      const byMetric = Object.fromEntries(results);
      const monthlyReport = monthlyRes ? (monthlyRes.data ?? monthlyRes) : null;
      const strongestMonth = monthlyReport?.series?.length
        ? monthlyReport.series.reduce((best, row) => (row.value > (best?.value ?? -Infinity) ? row : best), null)
        : null;

      if (strongestMonth && byMetric.children_reached && !byMetric.children_reached.notReady && !byMetric.children_reached.error) {
        byMetric.children_reached.caption =
          `${Math.round(strongestMonth.value).toLocaleString('en-ZA')} in ${monthName(strongestMonth.label)} · strongest month yet`;
      }

      setStats(byMetric);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const pdfStats = STAT_DEFS.map((def) => {
    const s = stats[def.metric];
    return {
      label: def.label,
      unit: def.unit,
      value: s?.value ?? 0,
      available: Boolean(s && !s.notReady && !s.error),
      caveat: s?.caveat ?? (s?.notReady ? s.message : ''),
    };
  });

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium">Impact Calculator</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              What the warehouse achieved, at a glance. ECDs and soup kitchens only;
              dignity kitchens don't require an impact report.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
              <Download /> Export PDF
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {STAT_DEFS.map((def) => (
            <ImpactStatCard key={def.metric} def={def} stat={stats[def.metric]} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Logging a kit is a warehouse-floor action, not a reporting
              one — it lives on its own staff module page (see
              FeedTheSoilPage.jsx) alongside Donation Intake and
              Benevolent Requests, not buried in a dialog here.
              buttonVariants applied directly to the Link rather than
              Button's own `asChild` — Button wraps Base UI's
              ButtonPrimitive, which does not merge onto a child the
              way Radix's Slot does, so `asChild` here would render a
              real nested <button> around the <a>. */}
          <Link to={STAFF.feedTheSoil} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Sprout /> Log a Feed the Soil kit
          </Link>
          <AdjustFactorsDialog />
        </div>

        <h2 className="mt-8 text-lg font-medium">Detailed breakdown</h2>
        <div className="mt-3 space-y-6">
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

      {pdfOpen ? (
        <ImpactCalculatorPDF stats={pdfStats} dateRange={dateRange} onClose={() => setPdfOpen(false)} />
      ) : null}
    </ManagerLayout>
  );
}
