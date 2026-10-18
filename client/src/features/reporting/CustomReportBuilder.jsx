// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/CustomReportBuilder.jsx
//
// "How many X by Y": pick what to count, how to break it down (up to
// two ways — every status field is one of them), what to measure and
// optionally one value to keep. Every option comes from the server's
// dataset list (catalog.datasets), so the controls cannot offer a
// combination the server would refuse, and a dataset added in
// customQuery.js appears here with no change to this file.
// ─────────────────────────────────────────────────────────────
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RANGE_PRESETS } from './dateRanges';

import { defaultCustom } from './customSpec';

const NONE = '__none__';
const words = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function CustomReportBuilder({ datasets, value, preset, onChange, onPresetChange, onRun, busy }) {
  const ds = datasets.find((d) => d.id === value?.dataset) ?? datasets[0];
  if (!ds) return null;
  const [g1, g2] = value?.groupBy ?? [];
  const set = (patch) => onChange({ ...value, ...patch });
  const field = 'flex flex-col gap-1.5 min-w-0';
  const valueFilters = ds.filters.filter((f) => f.values);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={field}>
          <Label htmlFor="cr-dataset">Count</Label>
          <Select value={ds.id} onValueChange={(id) => onChange(defaultCustom(datasets.find((d) => d.id === id)))}>
            <SelectTrigger id="cr-dataset"><SelectValue /></SelectTrigger>
            <SelectContent>
              {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className={field}>
          <Label htmlFor="cr-group">Break down by</Label>
          <Select value={g1 ?? NONE} onValueChange={(v) => set({ groupBy: v === NONE ? [] : [v, g2].filter((x) => x && x !== v) })}>
            <SelectTrigger id="cr-group"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Total only</SelectItem>
              {ds.groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className={field}>
          <Label htmlFor="cr-group2">Then by</Label>
          <Select
            value={g2 ?? NONE}
            onValueChange={(v) => set({ groupBy: [g1, v === NONE ? null : v].filter(Boolean) })}
            disabled={!g1}
          >
            <SelectTrigger id="cr-group2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nothing else</SelectItem>
              {ds.groups.filter((g) => g.id !== g1).map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {ds.measures.length > 1 && (
          <div className={field}>
            <Label htmlFor="cr-measure">Measure</Label>
            <Select value={value?.measure ?? ds.measures[0].id} onValueChange={(v) => set({ measure: v })}>
              <SelectTrigger id="cr-measure"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ds.measures.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {valueFilters.map((f) => (
          <div className={field} key={f.id}>
            <Label htmlFor={`cr-f-${f.id}`}>{f.label}</Label>
            <Select
              value={value?.filters?.[f.id] ?? NONE}
              onValueChange={(v) => {
                const filters = { ...(value?.filters ?? {}) };
                if (v === NONE) delete filters[f.id]; else filters[f.id] = v;
                set({ filters });
              }}
            >
              <SelectTrigger id={`cr-f-${f.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All</SelectItem>
                {f.values.map((v) => <SelectItem key={v} value={v}>{words(v)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}

        {ds.temporal === 'range' && (
          <div className={field}>
            <Label htmlFor="cr-period">Period</Label>
            <Select value={preset} onValueChange={onPresetChange}>
              <SelectTrigger id="cr-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        {ds.description}{ds.temporal === 'snapshot' ? ' This is the current position, not a period.' : ''}
      </p>

      <div className="mt-4">
        <Button
          type="button" onClick={onRun} disabled={busy}
          className="bg-ink hover:bg-ink/90 text-on-ink font-bold text-xs tracking-wider rounded-lg px-6" loading={busy}>
          {busy ? 'RUNNING…' : 'RUN REPORT'}
        </Button>
      </div>
    </div>
  );
}
