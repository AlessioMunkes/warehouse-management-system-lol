// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ReportBuilder.jsx
//
// The controls. Every option is driven by the server catalog, so a
// metric added in reportCatalog.js appears here with no change to
// this file — that is the point of fetching /catalog rather than
// hard-coding a list.
//
// This is also the path that survives handover: when the API key
// lapses the ask box hides and these dropdowns keep working.
// ─────────────────────────────────────────────────────────────
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RANGE_PRESETS } from '../dateRanges';

const ALL = '__all__';

// Mirrors the database enums. Kept alongside the labels a manager
// would recognise rather than the raw values.
const FILTER_OPTIONS = {
  cohort: [
    { value: 'week1', label: 'Week 1' },
    { value: 'week2', label: 'Week 2' },
  ],
  // dignity_kitchen and community are selectable for operational
  // reports but excluded server-side from impact metrics under
  // NFR-20, so a stale option here cannot leak them into an impact
  // figure.
  beneficiary_kind: [
    { value: 'ecd',             label: 'ECD centres' },
    { value: 'soup_kitchen',    label: 'Soup kitchens' },
    { value: 'dignity_kitchen', label: 'Dignity Kitchen' },
    { value: 'community',       label: 'Community' },
  ],
  movement_type: [
    { value: 'received',   label: 'Received' },
    { value: 'picked',     label: 'Picked' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'decanted',   label: 'Decanted' },
    { value: 'donated',    label: 'Donated' },
    { value: 'wastage',    label: 'Wastage' },
    { value: 'adjustment', label: 'Manual adjustment' },
  ],
  donation_category: [
    { value: 'recipe_food',     label: 'Recipe food' },
    { value: 'add_on_food',     label: 'Add-on food' },
    { value: 'non_recipe_food', label: 'Non-recipe food' },
    { value: 'non_food',        label: 'Non-food' },
  ],
};

const FILTER_LABELS = {
  cohort:            'Cohort',
  beneficiary_kind:  'Beneficiary type',
  movement_type:     'Movement type',
  donation_category: 'Donation category',
};

export default function ReportBuilder({
  catalog, metricId, dimension, preset, filters,
  onMetricChange, onDimensionChange, onPresetChange, onFilterChange, onRun, busy,
}) {
  const metric = catalog?.metrics.find((m) => m.id === metricId);

  // A snapshot is the current position, so a period selector would
  // imply a control that does nothing. Hiding it is more honest than
  // showing one the server ignores.
  const isSnapshot = metric?.temporal === 'snapshot';

  // Only render a filter the selected metric declares, so the
  // controls cannot offer a combination the server would reject.
  const selectable = (metric?.filters ?? []).filter((f) => FILTER_OPTIONS[f]);

  const field = 'flex flex-col gap-1.5 min-w-0';

  return (
    <div className="rounded-[4px] border-2 border-[#e9e3dd] bg-white p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <div className={field}>
          <Label htmlFor="metric">Report</Label>
          <Select value={metricId ?? ''} onValueChange={onMetricChange}>
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

        {!isSnapshot && (
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
        )}

        {selectable.map((key) => (
          <div className={field} key={key}>
            <Label htmlFor={key}>{FILTER_LABELS[key]}</Label>
            <Select
              value={filters[key] ?? ALL}
              onValueChange={(v) => onFilterChange(key, v === ALL ? null : v)}
            >
              <SelectTrigger id={key}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {FILTER_OPTIONS[key].map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* The same text the model is given as grounding, so a manager
          reading it sees exactly what the system thinks this report
          means. */}
      {metric?.description && (
        <p className="mt-4 text-sm leading-relaxed" style={{ color: '#676767' }}>
          {metric.description}
        </p>
      )}

      {isSnapshot && (
        <p className="mt-2 text-xs" style={{ color: '#676767' }}>
          This is a live figure — it shows the current position, not a period.
        </p>
      )}

      <div className="mt-4">
        <Button
          type="button" onClick={onRun} disabled={busy || !metricId}
          className="bg-[#2b3336] hover:bg-black text-white font-bold text-xs tracking-wider rounded-[4px] px-6"
        >
          {busy ? 'RUNNING…' : 'RUN REPORT'}
        </Button>
      </div>
    </div>
  );
}
