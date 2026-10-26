// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ReportBuilder.jsx
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
import { RANGE_PRESETS } from './dateRanges';
import { COHORT_OPTIONS } from '@/lib/cohorts';

const ALL = '__all__';

// Mirrors the database enums. Kept alongside the labels a manager
// would recognise rather than the raw values.
const FILTER_OPTIONS = {
  cohort: COHORT_OPTIONS,
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
  // Staff activity's areas (the server's STAFF_AREAS).
  staff_area: [
    { value: 'receiving',   label: 'Receiving' },
    { value: 'packing',     label: 'Packing' },
    { value: 'gate',        label: 'Dispatch gate' },
    { value: 'decanting',   label: 'Decanting' },
    { value: 'donations',   label: 'Donations' },
    { value: 'adjustments', label: 'Stock adjustments' },
  ],
};

const FILTER_LABELS = {
  cohort:            'Cohort',
  beneficiary_kind:  'Beneficiary type',
  movement_type:     'Movement type',
  donation_category: 'Donation category',
};

// Enum values and statuses arrive as stored ("partially_received").
const tidy = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function ReportBuilder({
  catalog, metricId, dimension, preset, filters,
  onMetricChange, onDimensionChange, onPresetChange, onFilterChange, onRun, busy,
  filterOptions = {}, customRange = null, onCustomRangeChange = () => {}, today = '',
}) {
  const metric = catalog?.metrics.find((m) => m.id === metricId);

  // A snapshot is the current position, so a period selector would
  // imply a control that does nothing. Hiding it is more honest than
  // showing one the server ignores.
  const isSnapshot = metric?.temporal === 'snapshot';

  // EVERY filter the selected report declares, so the controls can
  // narrow a report as far as a drill can, and never offer a
  // combination the server would reject. The choices come from, in
  // order: the hand-labelled lists above, the catalog's fixed values,
  // then the live lists (suppliers, products, centres, statuses as
  // recorded). A filter with nothing to choose from is left out.
  const defs = catalog?.filterDefs ?? {};
  const optionsFor = (key) => FILTER_OPTIONS[key]
    ?? (defs[key]?.values ? defs[key].values.map((v) => ({ value: v, label: tidy(v) })) : null)
    ?? (filterOptions[key] ?? []).map((o) => ({ value: String(o.value), label: defs[key]?.kind === 'text' ? tidy(o.label) : o.label }));
  const selectable = (metric?.filters ?? [])
    .map((key) => ({ key, label: FILTER_LABELS[key] ?? defs[key]?.label ?? tidy(key), options: optionsFor(key) }))
    .filter((f) => f.options.length > 0);
  const range = customRange ?? { from: '', to: '' };

  const field = 'flex flex-col gap-1.5 min-w-0';

  return (
    <div className="rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4 sm:p-5">
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
                {RANGE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Any two dates, for a period the list above does not have. */}
        {!isSnapshot && preset === 'custom' && (
          <>
            <div className={field}>
              <Label htmlFor="range-from">From</Label>
              <input id="range-from" type="date" value={range.from} max={range.to || today || undefined}
                onChange={(e) => onCustomRangeChange({ ...range, from: e.target.value })}
                className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" />
            </div>
            <div className={field}>
              <Label htmlFor="range-to">To</Label>
              <input id="range-to" type="date" value={range.to} min={range.from || undefined} max={today || undefined}
                onChange={(e) => onCustomRangeChange({ ...range, to: e.target.value })}
                className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" />
            </div>
          </>
        )}

        {selectable.map(({ key, label, options }) => (
          <div className={field} key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Select
              value={filters[key] !== undefined && filters[key] !== null ? String(filters[key]) : ALL}
              onValueChange={(v) => onFilterChange(key, v === ALL ? null : v)}
            >
              <SelectTrigger id={key}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {options.map((o) => (
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
        <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          {metric.description}
        </p>
      )}

      {isSnapshot && (
        <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
          This is a live figure. It shows the current position, not a period.
        </p>
      )}

      <div className="mt-4">
        <Button
          type="button" onClick={onRun} disabled={busy || !metricId || (!isSnapshot && preset === 'custom' && !(range.from && range.to))}
          className="bg-ink hover:bg-ink/90 text-on-ink font-bold text-xs tracking-wider rounded-lg px-6" loading={busy}>
          {busy ? 'RUNNING…' : 'RUN REPORT'}
        </Button>
      </div>
    </div>
  );
}
