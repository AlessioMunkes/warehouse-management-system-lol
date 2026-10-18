// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ExceptionAlerts.jsx
//
// EXCEPTION ALERTS on the Operations reports page: every weekly measure
// judged against its own normal range, so a manager sees what moved
// without opening fourteen charts to find out.
//
// Each card is a small control chart: the weeks of the baseline, the
// band between the control limits (mean ± 2σ), and the latest complete
// week, which is the one being judged. The server does the statistics
// (server/src/features/reporting/controlLimits.js); this draws them,
// most pressing first, and opens the full weekly report behind a card.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import NativeSelect from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import { getExceptionAlerts } from '../../services/reportingAPI';

const SIGNAL = {
  adverse: { label: 'Adverse', tone: 'bg-danger-soft text-danger', line: 'var(--danger-ink)' },
  trend: { label: 'Adverse trend', tone: 'bg-warn-soft text-warn', line: 'var(--warn-ink)' },
  unusual: { label: 'Outside limits', tone: 'bg-warn-soft text-warn', line: 'var(--warn-ink)' },
  favourable: { label: 'Favourable', tone: 'bg-good-soft text-good', line: 'var(--good-ink)' },
};
const QUIET = { label: 'In control', tone: 'bg-surface-2 text-ink', line: 'var(--ink)' };
const NO_BASIS = { label: 'Insufficient history', tone: 'bg-surface-2 text-muted-foreground', line: 'var(--ink-soft)' };
const BASELINES = [8, 12, 26];

const stateOf = (item) => (item.signal ? SIGNAL[item.signal] : item.status === 'in_control' ? QUIET : NO_BASIS);

const formatValue = (value, unit) => {
  if (value === null || value === undefined) return 'No reading';
  const n = Number(value);
  if (unit === '%') return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}%`;
  if (unit === 'ZAR') return `R ${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} ${unit}`;
};

const W = 240;
const H = 64;
const PAD = 6;

// The baseline, the control band and the latest week, in one small chart.
function ControlChart({ item, colour }) {
  const values = item.points.map((p) => p.value).filter((v) => v !== null);
  if (values.length < 2) return <div className="h-16 rounded-lg bg-surface-2" />;
  const lo = Math.min(...values, item.lower ?? Infinity);
  const hi = Math.max(...values, item.upper ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i) => PAD + (i / (item.points.length - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const drawn = item.points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null);
  const path = drawn.map((p, k) => `${k ? 'L' : 'M'} ${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const last = drawn[drawn.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img"
      aria-label={`${item.label} by week. Latest ${formatValue(item.latest, item.unit)}${item.upper !== null ? `, control limits ${formatValue(item.lower, item.unit)} to ${formatValue(item.upper, item.unit)}` : ''}.`}>
      {item.upper !== null ? (
        <>
          <rect x={PAD} y={y(item.upper)} width={W - PAD * 2} height={Math.max(1, y(item.lower) - y(item.upper))} fill="var(--surface-2)" rx="3" />
          <line x1={PAD} x2={W - PAD} y1={y(item.mean)} y2={y(item.mean)} stroke="var(--line-strong)" strokeDasharray="3 3" />
        </>
      ) : null}
      <path d={path} fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinejoin="round" />
      {drawn.slice(0, -1).map((p) => <circle key={p.label} cx={x(p.i)} cy={y(p.value)} r="1.8" fill="var(--ink-soft)" />)}
      <circle cx={x(last.i)} cy={y(last.value)} r="4" fill={colour} />
    </svg>
  );
}

export default function ExceptionAlerts({ onOpenReport }) {
  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [onlySignals, setOnlySignals] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    getExceptionAlerts(weeks)
      .then((res) => { if (!cancelled) setData(res.data ?? res); })
      .catch((err) => { if (!cancelled) { setError(err.message); setData(null); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [weeks]);

  const items = data ? data.items.filter((i) => (onlySignals ? Boolean(i.signal) : true)) : [];
  const signals = data ? data.items.filter((i) => i.signal).length : 0;

  return (
    <section aria-labelledby="alerts-heading" className="rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5">
      <h2 id="alerts-heading" className="text-sm font-bold tracking-tight">Exception alerts</h2>
      <p className="mt-1 text-sm text-ink">Weekly measures compared with their control limits. Open a measure to view its full report.</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Baseline
          <NativeSelect className="w-36" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {BASELINES.map((w) => <option key={w} value={w}>{w} weeks</option>)}
          </NativeSelect>
        </label>
        <label className="flex h-9 items-center gap-2 text-xs font-semibold text-ink">
          <input type="checkbox" checked={onlySignals} onChange={(e) => setOnlySignals(e.target.checked)} className="accent-[var(--ink)]" />
          Exceptions only
        </label>
      </div>

      <ErrorBanner className="mt-3" message={error} />
      {busy && !data ? <Skeleton className="mt-4 h-64 w-full rounded-2xl" /> : null}

      {data ? (
        <div className={busy ? 'opacity-60' : ''}>
          <p className="mt-4 text-sm font-semibold text-ink" role="status">
            {signals === 0
              ? `No exceptions in week ${data.latestWeek}.`
              : `${signals} of ${data.items.length} measures flagged in week ${data.latestWeek}: ${data.summary.adverse} adverse, ${data.summary.trend} trending, ${data.summary.unusual} outside limits, ${data.summary.favourable} favourable.`}
          </p>

          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No measures to show.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const state = stateOf(item);
                const judged = item.status === 'in_control' || item.status === 'out_of_control';
                return (
                  <li key={item.metric} className="flex flex-col rounded-2xl border border-line bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-ink">{item.label}</h3>
                      <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${state.tone}`}>{state.label}</span>
                    </div>
                    <p className="mt-1 text-lg font-bold tabular-nums text-ink">{formatValue(item.latest, item.unit)}</p>
                    <p className="text-xs text-muted-foreground">
                      {judged
                        ? `Expected ${formatValue(Math.max(0, item.lower), item.unit)} to ${formatValue(item.upper, item.unit)}${item.deviation !== null ? ` · ${item.deviation > 0 ? '+' : ''}${Number(item.deviation).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}σ` : ''}`
                        : item.status === 'unavailable' ? 'This measure could not be calculated.'
                          : `${item.baselineWeeks ?? 0} of 6 baseline weeks recorded.`}
                    </p>
                    <div className="mt-2"><ControlChart item={item} colour={state.line} /></div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {item.better === 'up' ? 'Higher is better' : item.better === 'down' ? 'Lower is better' : 'No preferred direction'}
                      </span>
                      {onOpenReport && item.status !== 'unavailable' ? (
                        <button type="button" onClick={() => onOpenReport(item.metric)}
                          aria-label={`Open report: ${item.label}`}
                          className="font-semibold text-ink underline underline-offset-2">Open report</button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Control limits are the baseline mean ± 2 standard deviations over the {data.baselineWeeks} weeks before week {data.latestWeek}. The week in progress is excluded.
            An adverse trend is three consecutive weekly changes in the unfavourable direction.
          </p>
        </div>
      ) : null}
    </section>
  );
}
