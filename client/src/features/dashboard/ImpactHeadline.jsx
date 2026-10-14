// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/ImpactHeadline.jsx
//
// The line the manager dashboard opens on: what the work did this
// month. Children reached, meals and kilograms sent out, before any
// count of what is waiting. A food bank's home screen should say what
// it is for first; the operational tiles come under it.
//
// The same reports the Impact report page runs (children_reached,
// meals_enabled) and the dispatch total, each with no breakdown, for
// the month so far. A figure that cannot be worked out (a factor not
// set up, a failed request) is left out rather than shown as 0; with
// none of them, nothing is drawn.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Baby, BowlFood, Truck } from '@phosphor-icons/react';
import { runReport } from '../../services/reportingAPI';
import { resolvePreset } from '../reporting/dateRanges';

const FIGURES = [
  { metric: 'children_reached', label: 'children reached', icon: Baby, tone: 'var(--viz-1)' },
  { metric: 'meals_enabled', label: 'meals made possible', icon: BowlFood, tone: 'var(--viz-2)' },
  { metric: 'dispatch_volume', label: 'kg of food sent out', icon: Truck, tone: 'var(--viz-3)' },
];

const valueOf = (res) => {
  const report = res?.data ?? res;
  const v = report?.series?.[0]?.value ?? report?.total;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

export default function ImpactHeadline() {
  const [values, setValues] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const dateRange = resolvePreset('this_month');
    Promise.all(FIGURES.map((f) => runReport({ metric: f.metric, dimension: 'none', filters: {}, dateRange })
      .then(valueOf)
      .catch(() => null)))
      .then((out) => { if (!cancelled) setValues(out); });
    return () => { cancelled = true; };
  }, []);

  if (!values || values.every((v) => v === null)) return null;

  return (
    <section aria-label="This month so far" className="rounded-2xl bg-card px-5 py-4 shadow-(--card-shadow) dark:ring-1 dark:ring-foreground/10">
      <p className="text-xs font-semibold text-muted-foreground">This month so far</p>
      <ul className="mt-2 grid gap-4 sm:grid-cols-3">
        {FIGURES.map((f, i) => (values[i] === null ? null : (
          <li key={f.metric} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${f.tone} 15%, transparent)`, color: f.tone }}
            >
              <f.icon className="size-6" weight="duotone" />
            </span>
            <span className="min-w-0">
              <span className="block text-3xl font-semibold leading-none tracking-tight tabular-nums text-ink">
                {Math.round(values[i]).toLocaleString('en-ZA')}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{f.label}</span>
            </span>
          </li>
        )))}
      </ul>
    </section>
  );
}
