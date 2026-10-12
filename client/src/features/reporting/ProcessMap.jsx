// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ProcessMap.jsx
//
// PROCESS MINING on the Operations reports page: the warehouse's main
// process, purchase order to dispatch note, drawn as the steps things
// really went through and how long each wait typically was.
//
// Three lanes, because three different things move (the server's
// features/reporting/processMining.js explains why): an order, stock on
// the shelf, a pallet. Each lane is a row of steps joined by arrows.
// An arrow is a button: choosing it opens what is behind that wait,
// which is the break-down the map exists for:
//
//   the figures     typical, average, and the slow end (9 in 10)
//   slowest cases   the orders or pallets that waited longest there
//   routes taken    every way a case went through the lane
//   break-downs     by supplier, by cohort, by product
//
// It loads only when opened. The shelf lane replays the whole stock
// ledger, and nobody who came for a chart should wait on that.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ArrowRight, ArrowDown, Timer } from 'lucide-react';
import NativeSelect from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import { getProcessMap } from '../../services/reportingAPI';
import { RANGE_PRESETS, resolvePreset } from './dateRanges';
import { exportExcel } from '../../lib/excelExport';
import { duration, sheetRows, SHEET_COLUMNS } from './processFormat';

const PRESETS = RANGE_PRESETS.filter((p) => p.id !== 'custom' && p.id !== 'today' && p.id !== 'yesterday');
const COHORTS = [['tuesday', 'Tuesday'], ['thursday', 'Thursday']];
const KINDS = [['ecd', 'ECD centres'], ['soup_kitchen', 'Soup kitchens'], ['dignity_kitchen', 'Dignity Kitchen'], ['community', 'Community']];

const count = (n) => Number(n ?? 0).toLocaleString('en-ZA');

function Step({ step, noun }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 py-2.5 text-center">
      <p className="text-sm font-bold text-ink">{step.label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{count(step.cases)} {noun}</p>
    </div>
  );
}

function Arrow({ transition, active, slowest, onPick }) {
  const none = transition.cases === 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      title={`${transition.label}. Open what is behind it.`}
      className={`flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors lg:flex-col lg:gap-0.5
        ${active ? 'bg-ink text-on-ink' : slowest ? 'bg-warn-soft text-warn hover:brightness-95' : 'text-ink hover:bg-muted/60'}`}
    >
      <ArrowDown aria-hidden="true" className="size-4 lg:hidden" />
      <span className="whitespace-nowrap lg:max-w-[5.5rem] lg:whitespace-normal lg:text-center lg:leading-tight">{none ? 'No time yet' : duration(transition.medianHours)}</span>
      <ArrowRight aria-hidden="true" className="hidden size-4 lg:block" />
      <span className="sr-only">{transition.label}{slowest ? ', the slowest step' : ''}</span>
    </button>
  );
}

function Bars({ rows, valueOf, textOf }) {
  const max = Math.max(...rows.map(valueOf), 0) || 1;
  return (
    <ul className="mt-2 space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{textOf(r)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div className="h-1.5 rounded-full bg-ink" style={{ width: `${Math.max(2, (valueOf(r) / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Figure({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// What is behind one arrow: its figures, its slowest cases, and the
// lane it belongs to broken down.
function Detail({ lane, transition, onClose }) {
  const slowestHeading = lane.id === 'shelf' ? 'Products that sat longest' : `Slowest ${lane.caseNoun}`;
  return (
    <section aria-label={`${transition.label}: what is behind it`} className="mt-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{lane.label}</p>
          <h3 className="text-sm font-bold text-ink">{transition.label}</h3>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-ink">Close</button>
      </div>

      {transition.cases === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing has been through this step in the period, so there is no time to show.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Figure label="Typical" value={duration(transition.medianHours)} hint="Half were quicker" />
            <Figure label="Average" value={duration(transition.averageHours)} />
            <Figure label="Slow end" value={duration(transition.p90Hours)} hint="9 in 10 were quicker" />
            <Figure label="Measured" value={count(transition.cases)} hint={lane.caseNoun} />
          </div>
          {transition.slowest?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-bold text-ink">{slowestHeading}</h4>
              <Bars rows={transition.slowest} valueOf={(r) => r.hours ?? 0} textOf={(r) => duration(r.hours)} />
            </div>
          )}
        </>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {lane.variants?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-ink">Routes taken</h4>
            <Bars rows={lane.variants} valueOf={(r) => r.cases} textOf={(r) => `${count(r.cases)} · ${r.share}%`} />
          </div>
        )}
        {lane.groups?.filter((g) => g.rows.length > 0).map((g) => (
          <div key={g.id}>
            <h4 className="text-xs font-bold text-ink">{g.label}</h4>
            <Bars rows={g.rows} valueOf={(r) => r.medianHours ?? 0} textOf={(r) => duration(r.medianHours)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Lane({ lane, picked, bottleneck, onPick }) {
  const byId = Object.fromEntries(lane.transitions.map((t) => [t.id, t]));
  const whole = byId[lane.headline];
  return (
    <div className="rounded-2xl border border-line bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-bold text-ink">
          {lane.label}
          {lane.estimate ? <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Estimate</span> : null}
        </h3>
        {whole && lane.path.length > 1 ? (
          <button type="button" onClick={() => onPick(lane.id, whole.id)} aria-pressed={picked === whole.id}
            className={`rounded-lg px-2 py-1 text-xs font-bold ${picked === whole.id ? 'bg-ink text-on-ink' : 'border border-line text-ink hover:bg-muted/60'}`}>
            Whole lane: {whole.cases ? duration(whole.medianHours) : 'no time yet'}
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col items-stretch gap-1.5 lg:flex-row lg:items-center lg:overflow-x-auto">
        {lane.steps.map((step, i) => {
          const t = byId[lane.path[i]];
          return (
            <div key={step.id} className="contents">
              <Step step={step} noun={lane.caseNoun} />
              {t ? (
                <Arrow transition={t} active={picked === t.id}
                  slowest={bottleneck?.lane === lane.id && bottleneck?.id === t.id}
                  onPick={() => onPick(lane.id, t.id)} />
              ) : null}
            </div>
          );
        })}
      </div>
      {lane.note ? <p className="mt-2.5 text-xs text-muted-foreground">{lane.note}</p> : null}
    </div>
  );
}

export default function ProcessMap({ suppliers = [] }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState('last_3m');
  const [supplierId, setSupplierId] = useState('');
  const [cohort, setCohort] = useState('');
  const [kind, setKind] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);       // { lane, id }
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setBusy(true);
    setError(null);
    getProcessMap(resolvePreset(preset), { supplierId: supplierId || null, cohort: cohort || null, beneficiaryKind: kind || null })
      .then((res) => { if (!cancelled) { setData(res.data ?? res); setPicked(null); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setData(null); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [open, preset, supplierId, cohort, kind]);

  const pickedLane = useMemo(() => data?.lanes.find((l) => l.id === picked?.lane) ?? null, [data, picked]);
  const pickedTransition = pickedLane?.transitions.find((t) => t.id === picked?.id) ?? null;
  const pick = (lane, id) => setPicked((now) => (now?.lane === lane && now?.id === id ? null : { lane, id }));

  const exportSheet = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      await exportExcel({
        filename: `process-map-${data.range.from}-to-${data.range.to}`,
        sheetName: 'Process map',
        title: 'Process map: purchase order to dispatch note',
        subtitle: `${data.range.from} to ${data.range.to}`,
        columns: SHEET_COLUMNS,
        rows: sheetRows(data),
      });
    } catch (err) {
      setError(err.message || 'Could not make the Excel file. Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-labelledby="process-map-heading" className="mt-6">
      <h2 id="process-map-heading" className="mb-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="process-map"
          className="flex items-center gap-2 text-sm font-bold">
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          Process map
        </button>
      </h2>

      {open && (
        <div id="process-map" className="rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5">
          <p className="text-sm text-ink">From purchase order to dispatch note. Choose a time between two steps to see what is behind it.</p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Period
              <NativeSelect className="w-40" value={preset} onChange={(e) => setPreset(e.target.value)}>
                {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Supplier
              <NativeSelect className="w-48" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">All suppliers</option>
                {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Cohort
              <NativeSelect className="w-36" value={cohort} onChange={(e) => setCohort(e.target.value)}>
                <option value="">All cohorts</option>
                {COHORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Who it was for
              <NativeSelect className="w-44" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Everyone</option>
                {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </label>
            {data && !data.empty ? (
              <button type="button" onClick={exportSheet} disabled={exporting}
                className="ml-auto text-xs font-semibold text-ink underline underline-offset-2 disabled:opacity-60">
                {exporting ? 'Preparing' : 'Export to Excel'}
              </button>
            ) : null}
          </div>

          <ErrorBanner className="mt-3" message={error} />
          {busy && !data ? <Skeleton className="mt-4 h-64 w-full rounded-2xl" /> : null}

          {data?.empty ? (
            <p className="mt-4 text-sm text-muted-foreground">Nothing was ordered, packed or dispatched in this period. Choose a longer period.</p>
          ) : null}

          {data && !data.empty ? (
            <div className={busy ? 'opacity-60' : ''}>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Figure
                  label="Typical time, order raised to food collected"
                  value={data.endToEnd.medianHours === null ? 'Not enough yet' : duration(data.endToEnd.medianHours)}
                  hint={data.endToEnd.medianHours === null
                    ? 'One part of the process has no measured time in this period.'
                    : 'The three parts added together. Stock is not followed batch by batch.'}
                />
                <div className="rounded-2xl border border-line bg-warn-soft px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-warn"><Timer aria-hidden="true" className="size-3.5" /> Slowest step</p>
                  {data.bottleneck ? (
                    <>
                      <p className="mt-0.5 text-base font-bold text-ink">{data.bottleneck.label}: {duration(data.bottleneck.medianHours)}</p>
                      <button type="button" onClick={() => setPicked({ lane: data.bottleneck.lane, id: data.bottleneck.id })}
                        className="mt-0.5 text-xs font-semibold text-ink underline underline-offset-2">
                        See what is behind it
                      </button>
                    </>
                  ) : (
                    <p className="mt-0.5 text-sm text-ink">Too few cases in this period to name one.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {data.lanes.map((lane) => (
                  <Lane key={lane.id} lane={lane} bottleneck={data.bottleneck}
                    picked={picked?.lane === lane.id ? picked.id : null} onPick={pick} />
                ))}
              </div>

              {pickedLane && pickedTransition ? (
                <Detail lane={pickedLane} transition={pickedTransition} onClose={() => setPicked(null)} />
              ) : null}

              <p className="mt-3 text-xs text-muted-foreground">
                Purchase orders raised in the period, pallets booked for it, and stock that left in it. Times are between recorded moments, with no one named.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
