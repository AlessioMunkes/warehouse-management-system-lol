// ─────────────────────────────────────────────────────────────
// ImpactMapPage.jsx
//
// The manager's Impact map, under Insights beside the Impact report:
// every centre on a street map as a circle sized by meals enabled in the
// period, coloured by its collection cohort, grey when nothing reached
// it. Beside the map, the active centres that were not served, longest
// waiting first: that list is the screen's operational point.
//
// The figures are the reports' own (server/src/repositories/
// impactMap.repository.js): collected dispatches, kilograms loaded at the
// gate, meals from the kg_to_meals factor. The period defaults to the
// last 90 days, counted in South African days by the server.
//
// Where a centre is, a manager sets in Beneficiaries (Edit details); one with no
// pin is in the totals and the list, but not on the map, and the strip
// says how many. Behind sign-in only: these are children's centres.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPinOff, RefreshCw } from 'lucide-react';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import NativeSelect from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import EmptyState from '@/components/ui/empty-state';
import { formatCalendarDay } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { getImpactMap } from '../services/impactMapAPI';
import ImpactLeafletMap from '../features/impactMap/ImpactLeafletMap';
import {
  PRESETS, TONES, cohortLabel, cohortsIn, filterCentres, isPlaced, isServed, notServedList, presetOf, presetRange,
  sinceText, summarise,
} from '../features/impactMap/impactView';

const number = (n) => (n === null || n === undefined ? '-' : Math.round(n).toLocaleString('en-ZA'));

function Figure({ label, value, note, tone }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-xl font-semibold tabular-nums', tone)}>{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

function Swatch({ tone, label }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" className={TONES[tone]} fillOpacity="0.45" strokeWidth="1.5" /></svg>
      {label}
    </li>
  );
}

export default function ImpactMapPage() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cohort, setCohort] = useState('all');
  const [notServedOnly, setNotServedOnly] = useState(false);
  const [focusId, setFocusId] = useState(null);

  const load = useCallback(async (period) => {
    setLoading(true);
    try {
      setData(await getImpactMap(period));
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || 'Could not load the impact map.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getImpactMap(range)
      .then((next) => { if (!cancelled) { setData(next); setLoadError(null); } })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Could not load the impact map.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const centres = useMemo(() => data?.centres ?? [], [data]);
  const factor = data?.factor ?? null;
  const today = data?.range?.today;
  const shown = useMemo(() => filterCentres(centres, { cohort, notServedOnly }), [centres, cohort, notServedOnly]);
  const onMap = useMemo(() => shown.filter(isPlaced), [shown]);
  const summary = useMemo(() => summarise(shown, factor), [shown, factor]);
  const waiting = useMemo(() => notServedList(filterCentres(centres, { cohort })), [centres, cohort]);
  const preset = presetOf(data?.range);

  const sizeOf = useCallback((c) => (factor ? c.meals : c.kg), [factor]);
  const toneOf = useCallback((c) => (!isServed(c) ? 'idle' : (TONES[c.cohort] ? c.cohort : 'other')), []);
  const popupOf = useCallback((c) => [
    ['Meals enabled', factor ? number(c.meals) : 'No factor set'],
    ['Food', `${number(c.kg)} kg`],
    ['Collections', number(c.dispatches)],
    ['Last collection', c.lastCollected ? `${formatCalendarDay(c.lastCollected)} (${sinceText(c.lastCollected, today)})` : 'Never'],
    ['Cohort', cohortLabel(c.cohort)],
    ...(c.suburb ? [['Suburb', c.suburb]] : []),
  ], [factor, today]);

  const choosePreset = (days) => setRange(presetRange(Number(days), today));

  return (
    <PageShell width="max-w-7xl">
      <PageHeader
        title="Impact map"
        description="See where food reached and which centres have not been served."
        actions={(
          <Button type="button" variant="outline" onClick={() => load(range)} disabled={loading}>
            <RefreshCw /> Refresh
          </Button>
        )}
      />

      {loadError ? <div className="mt-4"><ErrorBanner message={loadError} onRetry={() => load(range)} /></div> : null}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="impact-preset">Period</Label>
          <NativeSelect
            id="impact-preset" className="w-44" value={preset ?? 'custom'}
            onChange={(e) => e.target.value !== 'custom' && choosePreset(e.target.value)} disabled={!today}
          >
            {PRESETS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
            <option value="custom">Custom</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="impact-from">From</Label>
          <Input
            id="impact-from" type="date" className="w-40" value={data?.range?.from ?? ''} max={data?.range?.to}
            onChange={(e) => e.target.value && setRange({ from: e.target.value, to: data?.range?.to })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="impact-to">To</Label>
          <Input
            id="impact-to" type="date" className="w-40" value={data?.range?.to ?? ''} min={data?.range?.from} max={today}
            onChange={(e) => e.target.value && setRange({ from: data?.range?.from, to: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="impact-cohort">Cohort</Label>
          <NativeSelect id="impact-cohort" className="w-36" value={cohort} onChange={(e) => setCohort(e.target.value)}>
            <option value="all">All cohorts</option>
            {cohortsIn(centres).map((c) => <option key={c} value={c}>{cohortLabel(c)}</option>)}
          </NativeSelect>
        </div>
        <Button
          type="button" variant={notServedOnly ? 'secondary' : 'outline'} aria-pressed={notServedOnly}
          onClick={() => setNotServedOnly((v) => !v)}
        >
          <MapPinOff /> Not served only
        </Button>
      </div>

      {!data ? (
        <div className="mt-5 space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-[28rem] w-full rounded-xl" />
        </div>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Summary" aria-busy={loading}>
            <Figure label="Meals enabled" value={factor ? number(summary.meals) : '-'} note={factor ? `${factor.value} meals a kg` : 'No meals factor set'} />
            <Figure label="Food delivered" value={`${number(summary.kg)} kg`} />
            <Figure label="Collections" value={number(summary.dispatches)} />
            <Figure label="Centres served" value={number(summary.served)} tone="text-good" />
            <Figure
              label="Not served" value={number(summary.notServed)} tone={summary.notServed > 0 ? 'text-danger' : undefined}
            />
          </dl>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-2">
              {onMap.length === 0 && !loading ? (
                <EmptyState
                  className="rounded-xl border bg-card"
                  icon={MapPinOff}
                  title="No centre to show on the map"
                  description={shown.length === 0
                    ? 'Nothing matches these filters.'
                    : 'None of these centres has a location yet. Add one in Beneficiaries, under Edit details.'}
                />
              ) : null}
              <ImpactLeafletMap
                centres={onMap} sizeOf={sizeOf} toneOf={toneOf} popupOf={popupOf} focusId={focusId}
              />
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
                <Swatch tone="tuesday" label="Tuesday cohort" />
                <Swatch tone="thursday" label="Thursday cohort" />
                <Swatch tone="other" label="Other cohort" />
                <Swatch tone="idle" label="Not served in this period" />
                <li>Circle area shows {factor ? 'meals enabled' : 'kilograms delivered'}.</li>
              </ul>
              {summary.unplaced > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {summary.unplaced} of {shown.length} centres have no location yet, so they are counted but not drawn. Add them in Beneficiaries, under Edit details.
                </p>
              ) : null}
            </div>

            <section className="rounded-xl border bg-card" aria-labelledby="waiting-heading">
              <div className="border-b px-4 py-3">
                <h2 id="waiting-heading" className="text-sm font-medium">Not served in this period</h2>
              </div>
              {waiting.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Every active centre was served.</p>
              ) : (
                <ul className="max-h-[30rem] divide-y overflow-y-auto" aria-label="Centres not served">
                  {waiting.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={!isPlaced(c)}
                        onClick={() => setFocusId(c.id)}
                        className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left enabled:hover:bg-muted/50 disabled:cursor-default"
                        title={isPlaced(c) ? 'Show on the map' : 'No location yet'}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[cohortLabel(c.cohort), c.suburb, !isPlaced(c) ? 'No location' : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-danger">{sinceText(c.lastCollected, today)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {formatCalendarDay(data.range.from)} to {formatCalendarDay(data.range.to)}. Collected dispatches only; meals and kilograms count kilogram lines, as the Meals enabled report does.
          </p>
        </>
      )}
    </PageShell>
  );
}
