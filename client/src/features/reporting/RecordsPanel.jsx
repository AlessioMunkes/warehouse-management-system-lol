// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/RecordsPanel.jsx
//
// The last level of a drill: the records a report, or one bar of it,
// is made of. Delivery lines, pallets, stock movements: the rows that
// were counted, for the same period and filters as the chart.
//
// The server decides the columns (reportingRecords.repository.js), so
// a new kind of record needs nothing here. Numbers are right-aligned
// and money is written in rand; the Excel export (lib/excelExport.js)
// writes the same columns as real dates, numbers and amounts.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import { listRecords } from '../../services/reportingAPI';
import { formatLabel } from './chartFormat';
import { exportExcel } from '../../lib/excelExport';
import ListToolbar from '@/components/ui/list-toolbar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';

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

  // The server decides the columns, so the Columns menu and the filters
  // are built from them: the first column always on, and a filter for
  // each text column with a short list of values (area, supplier, status).
  const columns = useMemo(
    () => (data?.columns ?? []).map((c, i) => ({ ...c, alwaysOn: i === 0 })),
    [data],
  );
  const view = useTableView('reportRecords', columns);
  const filterDefs = useMemo(() => (data?.columns ?? [])
    .filter((c, i) => i > 0 && c.kind === 'text')
    .filter((c) => {
      const values = new Set((data?.rows ?? []).map((r) => r[c.key]).filter((v) => v !== null && v !== undefined && v !== ''));
      return values.size >= 2 && values.size <= 15;
    })
    .map((c) => ({ key: c.key, label: c.label, valueOf: (r) => r[c.key] })), [data]);
  const listFilters = useListFilters(filterDefs, data?.rows ?? []);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = listFilters.apply(data?.rows ?? [])
    .filter((r) => !q || columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)));

  const [exporting, setExporting] = useState(false);
  const exportSheet = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      await exportExcel({
        filename: `${data.metric}-records-${data.period.replace(/ /g, '-')}`,
        sheetName: data.noun,
        title: data.title,
        subtitle: data.truncated ? `${data.period}  ·  first ${data.shown} of ${data.total}` : `${data.period}  ·  ${data.total} in all`,
        columns: data.columns,
        rows: data.rows,
      });
    } catch (err) {
      setError(err.message || 'Could not make the Excel file. Try again.');
    } finally {
      setExporting(false);
    }
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
            <button type="button" onClick={exportSheet} disabled={exporting} className="font-semibold text-ink underline underline-offset-2 disabled:opacity-60">
              {exporting ? 'Preparing' : 'Export to Excel'}
            </button>
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
        <div className="mt-3 space-y-3">
          <ListToolbar
            search={{ value: search, onChange: setSearch, placeholder: `Search these ${data.noun ?? 'records'}` }}
            filters={listFilters.filters}
            onClearAll={() => { setSearch(''); listFilters.clear(); }}
            columns={{
              idPrefix: 'report-records',
              columns: view.availableColumns,
              hidden: view.hidden,
              onToggle: view.toggleColumn,
              onReset: view.resetColumns,
            }}
          />
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-line">
            <Table>
              <TableHeader className="sticky top-0 bg-surface">
                <TableRow>
                  {view.visibleColumns.map((c) => (
                    <TableHead key={c.key} className={NUMERIC.has(c.kind) ? 'text-right' : ''}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={view.visibleColumns.length} className="text-muted-foreground">No records match.</TableCell>
                  </TableRow>
                ) : rows.map((row, i) => (
                  // Keyed by position: two lines of one delivery can be identical in every column shown.
                  <TableRow key={i}>
                    {view.visibleColumns.map((c) => (
                      <TableCell key={c.key} className={`align-top ${NUMERIC.has(c.kind) ? 'text-right tabular-nums' : ''} ${c.kind === 'text' ? 'max-w-[22rem] whitespace-normal' : ''}`}>
                        {show(row[c.key], c.kind)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
