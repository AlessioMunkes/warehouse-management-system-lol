// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/RecordsPanel.jsx
//
// The last level of a drill: the records a report, or one bar of it,
// is made of. Delivery lines, pallets, stock movements: the rows that
// were counted, for the same period and filters as the chart.
//
// The server decides the columns (reportingRecords.repository.js), so
// a new kind of record needs nothing here. Numbers are right-aligned
// and money is written in rand; the CSV carries the raw values.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import { listRecords } from '../../services/reportingAPI';
import { downloadCsv, formatLabel, toCsv } from './chartFormat';

const NUMERIC = new Set(['number', 'money']);

const show = (value, kind) => {
  if (value === null || value === undefined || value === '') return '';
  if (kind === 'money') return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (kind === 'number') return Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 3 });
  if (kind === 'date') {
    const [y, m, d] = String(value).split('-').map(Number);
    if (!y || !m || !d) return String(value);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return String(value);
};

export default function RecordsPanel({ spec, label = null, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const key = JSON.stringify([spec, label]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    listRecords(spec, label)
      .then((res) => { if (!cancelled) setData(res.data ?? res); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`${data.metric}_records_${data.period.replace(/ /g, '_')}.csv`, toCsv(data.rows, data.columns));
  };

  return (
    <section aria-label="Records behind the report" className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">
            {data ? data.title : `Records behind ${label ? formatLabel(label) : 'this report'}`}
          </h3>
          {data ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.period}. {data.truncated
                ? `Showing the first ${data.shown.toLocaleString('en-ZA')} of ${data.total.toLocaleString('en-ZA')}. Narrow the period or drill further to see the rest.`
                : `${data.total.toLocaleString('en-ZA')} in all.`}
              {data.ignoredFilters?.length ? ` Not narrowed by ${data.ignoredFilters.map((f) => f.replace(/_id$/, '').replace(/_/g, ' ')).join(', ')}: these records do not carry it.` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          {data?.rows.length ? (
            <button type="button" onClick={exportCsv} className="font-semibold text-ink underline underline-offset-2">Export CSV</button>
          ) : null}
          <button type="button" onClick={onClose} className="font-semibold text-muted-foreground hover:text-ink">Close</button>
        </div>
      </div>

      {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
      {!data && !error ? <Skeleton className="mt-3 h-40 w-full" /> : null}

      {data && data.rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No records for this period.</p>
      ) : null}

      {data && data.rows.length > 0 ? (
        <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-line">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr>
                {data.columns.map((c) => (
                  <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2 font-semibold text-ink ${NUMERIC.has(c.kind) ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Keyed by position: two lines of one delivery can be identical in every column shown. */}
              {data.rows.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  {data.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-1.5 align-top ${NUMERIC.has(c.kind) ? 'text-right tabular-nums' : ''} ${c.kind === 'text' ? 'max-w-[22rem]' : 'whitespace-nowrap'}`}>
                      {show(row[c.key], c.kind)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
