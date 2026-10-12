// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/WorkloadHeatmap.jsx
//
// THE WORKLOAD HEATMAP on the Operations reports page: how much work
// each area of the floor records, by weekday and hour, so staff and
// volunteers can be rostered for when it actually happens.
//
// One grid, weekdays down and hours across, darker for busier. The
// figure in a cell is the average for that weekday (a period with five
// Mondays would otherwise make Monday look busier than it is) or the
// total, as chosen. The server counts and averages (server/src/
// features/reporting/workload.js). It counts work recorded, never
// people.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import NativeSelect from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import { getWorkload } from '../../services/reportingAPI';
import { RANGE_PRESETS, resolvePreset } from './dateRanges';
import { exportExcel } from '../../lib/excelExport';

const PRESETS = RANGE_PRESETS.filter((p) => !['custom', 'today', 'yesterday'].includes(p.id));
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
const num = (n) => Number(n ?? 0).toLocaleString('en-ZA', { maximumFractionDigits: 1 });

function Fact({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function WorkloadHeatmap() {
  const [preset, setPreset] = useState('last_3m');
  const [areaId, setAreaId] = useState('receiving');
  const [measure, setMeasure] = useState('average');   // 'average' | 'total'
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    getWorkload(resolvePreset(preset))
      .then((res) => { if (!cancelled) setData(res.data ?? res); })
      .catch((err) => { if (!cancelled) { setError(err.message); setData(null); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [preset]);

  const area = data?.areas.find((a) => a.id === areaId) ?? data?.areas[0] ?? null;
  const top = area ? (measure === 'average' ? area.maxAverage : area.max) : 0;
  const cell = (weekday, hour) => area.cells.find((c) => c.weekday === weekday && c.hour === hour);

  const exportSheet = async () => {
    if (!data || !area || exporting) return;
    setExporting(true);
    try {
      await exportExcel({
        filename: `workload-${area.id}-${data.range.from}-to-${data.range.to}`,
        sheetName: 'Workload',
        title: `Workload: ${area.label}`,
        subtitle: `${data.range.from} to ${data.range.to}  ·  ${area.unit}`,
        columns: [
          { key: 'weekday', label: 'Weekday', kind: 'text' },
          { key: 'hour', label: 'Hour', kind: 'text' },
          { key: 'total', label: 'Total', kind: 'number' },
          { key: 'average', label: 'Average per weekday', kind: 'number' },
        ],
        rows: area.cells.filter((c) => c.total > 0).map((c) => ({ weekday: data.weekdays[c.weekday], hour: hourLabel(c.hour), total: c.total, average: c.average })),
      });
    } catch (err) {
      setError(err.message || 'Could not make the Excel file. Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-labelledby="workload-heading" className="rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5">
      <h2 id="workload-heading" className="text-sm font-bold tracking-tight">Workload</h2>
      <p className="mt-1 text-sm text-ink">Recorded activity by weekday and hour. Use it to plan staffing for each area.</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Period
          <NativeSelect className="w-40" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Area
          <NativeSelect className="w-48" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {(data?.areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </NativeSelect>
        </label>
        <div role="group" aria-label="Figure shown" className="flex rounded-3xl bg-input/50 p-0.5 text-xs font-bold">
          {[['average', 'Average per weekday'], ['total', 'Total']].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={measure === id} onClick={() => setMeasure(id)}
              className={`rounded-3xl px-3 py-1.5 ${measure === id ? 'bg-ink text-on-ink' : 'text-ink'}`}>{label}</button>
          ))}
        </div>
        {area && area.total > 0 ? (
          <button type="button" onClick={exportSheet} disabled={exporting}
            className="ml-auto text-xs font-semibold text-ink underline underline-offset-2 disabled:opacity-60">
            {exporting ? 'Preparing' : 'Export to Excel'}
          </button>
        ) : null}
      </div>

      <ErrorBanner className="mt-3" message={error} />
      {busy && !data ? <Skeleton className="mt-4 h-64 w-full rounded-2xl" /> : null}

      {data && area ? (
        <div className={busy ? 'opacity-60' : ''}>
          {area.total === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No {area.unit} recorded in this period. Select a longer period.</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Fact label={`Total ${area.unit}`} value={num(area.total)} hint={`${data.range.from} to ${data.range.to}`} />
                <Fact label="Peak hour" value={area.peak ? `${area.peak.weekday} ${hourLabel(area.peak.hour)}` : '-'}
                  hint={area.peak ? `${num(area.peak.average)} on an average ${area.peak.weekday}` : null} />
                <Fact label="Busiest weekday" value={area.busiestDay?.label ?? '-'}
                  hint={area.busiestDay ? `${num(area.busiestDay.average)} per day on average` : null} />
              </div>

              <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full border-collapse text-xs" aria-label={`${area.label}: ${area.unit} by weekday and hour`}>
                  <thead>
                    <tr className="bg-surface-2">
                      <th scope="col" className="px-3 py-2 text-left font-semibold text-ink">Weekday</th>
                      {data.hours.map((h) => <th key={h} scope="col" className="px-1 py-2 text-center font-semibold tabular-nums text-ink">{String(h).padStart(2, '0')}</th>)}
                      <th scope="col" className="px-3 py-2 text-right font-semibold text-ink">Per day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weekdays.map((weekday, d) => (
                      <tr key={weekday} className="border-t border-line">
                        <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-semibold text-ink">{weekday}</th>
                        {data.hours.map((h) => {
                          const c = cell(d, h);
                          const value = measure === 'average' ? c.average : c.total;
                          const strength = top ? value / top : 0;
                          return (
                            <td key={h} className="p-0.5 text-center"
                              title={`${weekday} ${hourLabel(h)}: ${num(c.average)} on average, ${num(c.total)} in total`}>
                              <div className="flex h-8 min-w-8 items-center justify-center rounded-md tabular-nums"
                                style={{
                                  background: value > 0 ? `color-mix(in srgb, var(--ink) ${Math.round(10 + strength * 80)}%, transparent)` : 'var(--surface-2)',
                                  color: strength > 0.5 ? 'var(--on-ink)' : 'var(--ink)',
                                }}>
                                {value > 0 ? num(value) : ''}
                              </div>
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums text-ink">
                          {num(measure === 'average' ? area.byWeekday[d].average : area.byWeekday[d].total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Counts recorded activity ({data.areas.map((a) => a.unit).join(', ')}), not people. Hours are South African time.
            The average divides each weekday total by the number of times that weekday falls in the period.
          </p>
        </div>
      ) : null}
    </section>
  );
}
