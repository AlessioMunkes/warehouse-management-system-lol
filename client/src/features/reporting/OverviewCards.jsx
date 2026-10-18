// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/OverviewCards.jsx
//
// The Overview tab of Operations reports: a person's own set of report
// cards. Each is a report shown small (TrendCard); Explore opens it in
// full on the Reports tab.
//
// "Customise" turns on editing: each card can be moved or removed, and
// any report in the catalogue can be added as a card with a chosen
// breakdown and period. The choice is kept per person on this device
// (overviewLayout.js), and "Reset to default" brings the four starting
// cards back.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, X, Plus, SlidersHorizontal, Truck, TrendingUp, CheckCircle2, AlertTriangle, BarChart3 } from 'lucide-react';
import NativeSelect from '@/components/ui/native-select';
import TrendCard from './TrendCard';
import useOverviewCards, { cardId, CARD_PERIODS, DEFAULT_PERIOD, MAX_CARDS } from './overviewLayout';

// The starting cards keep the icons they always had; any other report
// gets the general one.
const ICONS = {
  dispatch_volume: Truck, unit_price_trend: TrendingUp, collection_compliance: CheckCircle2, low_stock_items: AlertTriangle,
};

const iconButton = 'inline-flex size-7 items-center justify-center rounded-lg border border-line text-ink hover:bg-muted/60 disabled:opacity-40';

export default function OverviewCards({ user, metrics, onExplore }) {
  const { cards, customised, add, remove, move, reset, full } = useOverviewCards(user, metrics);
  const [editing, setEditing] = useState(false);
  const [metricId, setMetricId] = useState('');
  const [dimension, setDimension] = useState('');
  const [preset, setPreset] = useState(DEFAULT_PERIOD);
  const [note, setNote] = useState(null);

  const byId = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const sorted = useMemo(() => [...metrics].sort((a, b) => a.label.localeCompare(b.label)), [metrics]);
  const chosen = byId.get(metricId) ?? null;
  const periodLabel = (id) => CARD_PERIODS.find((p) => p.id === id)?.label ?? '';

  const pickMetric = (id) => {
    setMetricId(id);
    setDimension(byId.get(id)?.dimensions[0]?.id ?? '');
    setNote(null);
  };

  const addCard = () => {
    if (!chosen) return;
    const added = add({ metric: chosen.id, dimension, preset });
    setNote(added ? `${chosen.label} added.` : 'That card is already on the overview.');
    if (added) { setMetricId(''); setDimension(''); }
  };

  return (
    <section aria-labelledby="op-trends-heading">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="op-trends-heading" className="text-sm font-bold">At a glance</h2>
        <div className="flex items-center gap-2">
          {editing && customised ? (
            <button type="button" onClick={() => { reset(); setNote('Default cards restored.'); }}
              className="text-xs font-semibold text-ink underline underline-offset-2">Reset to default</button>
          ) : null}
          <button type="button" aria-pressed={editing} onClick={() => { setEditing((v) => !v); setNote(null); }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${editing ? 'bg-ink text-on-ink' : 'border border-line text-ink hover:bg-muted/60'}`}>
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            {editing ? 'Done' : 'Customise'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mb-3 rounded-2xl border border-line bg-card p-3">
          <h3 className="text-xs font-bold text-ink">Add a card</h3>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Report
              <NativeSelect className="w-64 max-w-full" value={metricId} onChange={(e) => pickMetric(e.target.value)}>
                <option value="">Select a report</option>
                {sorted.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Break down by
              <NativeSelect className="w-44" value={dimension} disabled={!chosen} onChange={(e) => setDimension(e.target.value)}>
                {chosen ? chosen.dimensions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>) : <option value="">-</option>}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Period
              <NativeSelect className="w-40" value={preset} onChange={(e) => setPreset(e.target.value)}>
                {CARD_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </NativeSelect>
            </label>
            <button type="button" onClick={addCard} disabled={!chosen || full}
              className="inline-flex h-9 items-center gap-1.5 rounded-3xl bg-ink px-4 text-xs font-bold text-on-ink disabled:opacity-50">
              <Plus aria-hidden="true" className="size-3.5" /> Add card
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {note ?? (full ? `The overview holds up to ${MAX_CARDS} cards. Remove one to add another.` : `${cards.length} of ${MAX_CARDS} cards. Saved for you on this device.`)}
          </p>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted-foreground">
          No cards on the overview. Select Customise to add one.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, i) => {
            const metric = byId.get(card.metric);
            const id = cardId(card);
            const breakdown = metric.dimensions.find((d) => d.id === card.dimension)?.label;
            return (
              <li key={id} className="min-w-0">
                {editing ? (
                  <div className="mb-1.5 flex items-center justify-end gap-1" role="group" aria-label={`${metric.label}: arrange`}>
                    <button type="button" className={iconButton} disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${metric.label} earlier`}>
                      <ArrowLeft aria-hidden="true" className="size-3.5" />
                    </button>
                    <button type="button" className={iconButton} disabled={i === cards.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${metric.label} later`}>
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </button>
                    <button type="button" className={iconButton} onClick={() => remove(id)} aria-label={`Remove ${metric.label}`}>
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                ) : null}
                <TrendCard
                  metricId={card.metric}
                  label={metric.label}
                  icon={ICONS[card.metric] ?? BarChart3}
                  dimension={card.dimension}
                  preset={card.preset}
                  caption={`${breakdown && card.dimension !== 'none' ? `By ${breakdown.toLowerCase()} · ` : ''}${periodLabel(card.preset)}`}
                  onExplore={() => onExplore(card)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
