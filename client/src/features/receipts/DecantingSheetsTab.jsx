// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/DecantingSheetsTab.jsx
//
// The Decanting sheets tab on Receipts: every decanting run the floor
// recorded, opened as the same sheet the worker saw when they saved it
// (DecantingSheetPDF). Delivery notes and dispatch notes are the papers
// for goods in and out; a decanting sheet is the paper for stock bagged
// on the floor, so it is kept with them.
//
// There are a few a week, so the whole list is read once and searched,
// filtered, sorted and paged here rather than on the server.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import TablePager from '@/components/ui/table-pager';
import ErrorBanner from '@/components/ui/error-banner';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/ui/status-badge';
import ReceiptsTable from './ReceiptsTable';
import DecantingSheetPDF from '../decanting/DecantingSheetPDF';
import { formatDate, formatDateShort } from './noteFormat';
import { getDecantingRecords, getDecantingById } from '../../services/decantingAPI';
import useTableView from '../masterdata/useTableView';

const PAGE_SIZE = 15;
const sheetNumber = (id) => `#${String(id).padStart(4, '0')}`;
const day = (value) => String(value ?? '').slice(0, 10);
const wastageOf = (r) => Number(r.total_wastage_kg) || 0;

const COLUMNS = [
  { key: 'sheet', header: 'Sheet', sortKey: 'id', render: (r) => sheetNumber(r.id) },
  { key: 'week', header: 'Week of', sortKey: 'week_of', render: (r) => formatDateShort(r.week_of) },
  { key: 'recorded', header: 'Recorded', sortKey: 'created_at', render: (r) => formatDateShort(r.created_at) },
  { key: 'by', header: 'Recorded by', sortKey: 'recorded_by_name', render: (r) => r.recorded_by_name || '-' },
  { key: 'lines', header: 'Lines', sortKey: 'line_count', render: (r) => Number(r.line_count) || 0 },
  {
    key: 'wastage', header: 'Wastage', sortKey: 'total_wastage_kg',
    render: (r) => (wastageOf(r) > 0
      ? <StatusBadge tone="warn">{wastageOf(r)} kg</StatusBadge>
      : <span className="text-muted-foreground">None</span>),
  },
];
// The sheet number cannot be hidden from the Columns menu.
const MENU = COLUMNS.map((c, i) => ({ ...c, label: c.header, alwaysOn: i === 0 }));

const FILTERS = [
  { key: 'wastage', label: 'Some wastage', test: (r) => wastageOf(r) > 0 },
  { key: 'clean', label: 'No wastage', test: (r) => wastageOf(r) === 0 },
];

export default function DecantingSheetsTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [only, setOnly] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [offset, setOffset] = useState(0);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [sheet, setSheet] = useState(null);
  const view = useTableView('receiptsDecanting', MENU);

  useEffect(() => {
    let cancelled = false;
    getDecantingRecords('all')
      .then((list) => { if (!cancelled) { setRecords(list ?? []); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the decanting sheets.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const test = FILTERS.find((f) => f.key === only)?.test ?? (() => true);
    const rows = records.filter((r) => test(r)
      && (!from || day(r.week_of) >= from)
      && (!to || day(r.week_of) <= to)
      && (!q || [sheetNumber(r.id), r.recorded_by_name, formatDate(r.week_of)].some((v) => String(v ?? '').toLowerCase().includes(q))));
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      const nx = Number(x); const ny = Number(y);
      if (!Number.isNaN(nx) && !Number.isNaN(ny) && sort.key !== 'week_of' && sort.key !== 'created_at') return (nx - ny) * sign;
      return String(x ?? '').localeCompare(String(y ?? '')) * sign;
    });
  }, [records, search, only, from, to, sort]);

  const page = shown.slice(offset, offset + PAGE_SIZE);
  const narrowed = Boolean(search || only || from || to);
  const clearAll = () => { setSearch(''); setOnly(''); setFrom(''); setTo(''); setOffset(0); };
  const reset = (fn) => (value) => { fn(value); setOffset(0); };

  const open = async (row) => {
    setOpening(true);
    setOpenError('');
    try {
      setSheet(await getDecantingById(row.id));
    } catch (err) {
      setOpenError(err.message || 'Could not open that sheet.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <ErrorBanner className="mt-4" message={openError} />
      <div className="mt-6">
        <ListCard
          header={(
            <ListToolbar
              search={{ value: search, onChange: reset(setSearch), placeholder: 'Sheet no., week or name', label: 'Search decanting sheets' }}
              filters={FILTERS.map((f) => ({
                key: f.key, label: f.label, active: only === f.key,
                onToggle: () => reset(setOnly)(only === f.key ? '' : f.key),
              }))}
              onClearAll={clearAll}
              columns={{
                idPrefix: 'receipts-decanting',
                columns: view.availableColumns,
                hidden: view.hidden,
                onToggle: view.toggleColumn,
                onReset: view.resetColumns,
              }}
            >
              <Input type="date" aria-label="From" title="Week of, from" className="h-8 w-auto" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" aria-label="To" title="Week of, to" className="h-8 w-auto" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
            </ListToolbar>
          )}
          footer={!loading && !error && shown.length ? (
            <TablePager
              page={Math.floor(offset / PAGE_SIZE) + 1}
              pages={Math.max(1, Math.ceil(shown.length / PAGE_SIZE))}
              from={offset + 1}
              to={offset + page.length}
              total={shown.length}
              prev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              next={() => setOffset(offset + PAGE_SIZE)}
              noun="decanting sheets"
              loading={opening}
              alwaysShow
            />
          ) : null}
        >
          <ReceiptsTable
            columns={view.visibleColumns}
            rows={page}
            rowKey={(r) => `s-${r.id}`}
            onOpen={open}
            isLoading={loading || opening}
            error={error}
            sort={sort.key}
            dir={sort.dir}
            onSortChange={(key, dir) => { setSort({ key, dir }); setOffset(0); }}
            emptyMessage="No decanting sheets match these filters."
            emptyAction={narrowed ? { label: 'Clear all filters', onClick: clearAll } : undefined}
          />
        </ListCard>
      </div>

      {sheet ? <DecantingSheetPDF record={sheet} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
