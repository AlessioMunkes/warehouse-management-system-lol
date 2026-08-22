// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ReportBuilder.jsx
//
// The controls. Every option is driven by the server catalog, so a
// metric added in reportCatalog.js appears here with no change to
// this file — that is the point of fetching /catalog rather than
// hard-coding a list.
//
// This is also the deterministic path that survives handover. When
// the AI ask box lands it produces the same spec object this builder
// produces; if the API key ever lapses, the box hides and these
// dropdowns keep working.
// ─────────────────────────────────────────────────────────────
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RANGE_PRESETS } from '../dateRanges';

const COHORTS = [
  { value: 'week1', label: 'Week 1' },
  { value: 'week2', label: 'Week 2' },
];

// Mirrors beneficiary_type in the database. dignity_kitchen and
// community are selectable for operational reports but are excluded
// server-side from impact metrics under NFR-20 — the server enforces
// that in SQL, so a stale option here cannot leak them into an
// impact figure.
const BENEFICIARIES = [
  { value: 'ecd',             label: 'ECD centres' },
  { value: 'soup_kitchen',    label: 'Soup kitchens' },
  { value: 'dignity_kitchen', label: 'Dignity Kitchen' },
  { value: 'community',       label: 'Community' },
];

const ALL = '__all__';

export default function ReportBuilder({
  catalog, metricId, dimension, preset, filters,
  onMetricChange, onDimensionChange, onPresetChange, onFilterChange, onRun, busy,
}) {
  const metric = catalog?.metrics.find((m) => m.id === metricId);

  // A filter renders only if the selected metric declares it, so the
  // controls cannot offer a combination the server would reject.
  const has = (key) => Boolean(metric?.filters.includes(key));

  const field = 'flex flex-col gap-1.5 min-w-0';

  return (
    <div className="rounded-[4px] border-2 border-[#e9e3dd] bg-white p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <div className={field}>
          <Label htmlFor="metric">Report</Label>
          <Select value={metricId} onValueChange={onMetricChange}>
            <SelectTrigger id="metric"><SelectValue /></SelectTrigger>
            <SelectContent>
              {catalog?.metrics.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={field}>
          <Label htmlFor="dimension">Break down by</Label>
          <Select value={dimension} onValueChange={onDimensionChange}>
            <SelectTrigger id="dimension"><SelectValue /></SelectTrigger>
            <SelectContent>
              {metric?.dimensions.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={field}>
          <Label htmlFor="period">Period</Label>
          <Select value={preset} onValueChange={onPresetChange}>
            <SelectTrigger id="period"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {has('cohort') && (
          <div className={field}>
            <Label htmlFor="cohort">Cohort</Label>
            <Select
              value={filters.cohort ?? ALL}
              onValueChange={(v) => onFilterChange('cohort', v === ALL ? null : v)}
            >
              <SelectTrigger id="cohort"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All cohorts</SelectItem>
                {COHORTS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {has('beneficiary_kind') && (
          <div className={field}>
            <Label htmlFor="beneficiary">Beneficiary type</Label>
            <Select
              value={filters.beneficiary_kind ?? ALL}
              onValueChange={(v) => onFilterChange('beneficiary_kind', v === ALL ? null : v)}
            >
              <SelectTrigger id="beneficiary"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All beneficiaries</SelectItem>
                {BENEFICIARIES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* The description doubles as the AI grounding text on the
          server, so a manager reading it here sees exactly what the
          model will be told this report means. */}
      {metric?.description && (
        <p className="mt-4 text-sm leading-relaxed" style={{ color: '#676767' }}>
          {metric.description}
        </p>
      )}

      <div className="mt-4">
        <Button
          type="button" onClick={onRun} disabled={busy}
          className="bg-[#2b3336] hover:bg-black text-white font-bold text-xs tracking-wider rounded-[4px] px-6"
        >
          {busy ? 'RUNNING…' : 'RUN REPORT'}
        </Button>
      </div>
    </div>
  );
}
