// ─────────────────────────────────────────────────────────────
// client/src/pages/ReceiptsPage.jsx
//
// The receipts archive: past delivery notes (goods in) and past
// dispatch notes (goods out).
//
// WHY BOTH IN ONE PAGE
// They answer the same question from opposite ends — "show me the
// paperwork for a movement that already happened" — and share a
// filter shape. Two pages would mean two entry tiles for one mental
// task.
//
// WHY A MODAL RATHER THAN A NESTED ROUTE
// Closing a note returns you to the list with the filters intact.
// A route would either lose them or need them in the URL, which is
// worth doing only once someone asks to share a link to a note.
//
// MANAGER AND ADMIN ONLY
// Gated at three points that must stay in step: the route guard in
// App.jsx, the absent tile on the worker dashboard, and
// requireRole(...MANAGERS_UP) on all four endpoints. The server gate
// is the one that actually holds — the other two only decide whether
// a person is invited.
//
// This departs from the URS, which puts both documents in front of
// warehouse staff (the procurement diagram's [view delivery note
// selected] frame is Warehouse Staff, and the dispatch one says the
// note is viewable by staff, admin and management). A browsable
// archive is a different thing from the one-time view those frames
// describe, and the team took the narrower reading. Worth recording
// in the URS as a deliberate deviation rather than leaving the
// document and the build disagreeing.
//
// It also settles the POPIA question that was open: both notes render
// the driver's signature image, and nobody below manager now reaches
// them, so no signature-stripping is needed in the service.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import ReceiptsTable from '../features/receipts/ReceiptsTable';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import TablePager from '@/components/ui/table-pager';
import ErrorBanner from '@/components/ui/error-banner';
import { Input } from '@/components/ui/input';
import NativeSelect from '@/components/ui/native-select';
import StatusBadge from '@/components/ui/status-badge';
import { VARIANCE_STYLE } from '@/lib/statusStyles';
import DeliveryNotePDF from '../features/receiving/DeliveryNotePDF';
import DispatchNotePDF from '../features/receipts/DispatchNotePDF';
import {
  formatDateShort, DISPATCH_STATUS_LABEL, DELIVERY_STATUS_LABEL,
} from '../features/receipts/noteFormat';
import receivingAPI from '../services/receivingAPI';
import dispatchAPI from '../services/dispatchAPI';

const PAGE_SIZE = 15;


const TABS = [
  { id: 'in',  label: 'Goods in · delivery notes' },
  { id: 'out', label: 'Goods out · dispatch notes' },
];

// A native select drawn like the app's Input, for the toolbar. Native
// rather than the Base UI Select so it stays a plain form control.

const shortDate = (value) => new Date(`${value}T00:00:00`)
  .toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

const DELIVERY_STATUS_OPTIONS = [
  { value: 'recorded', label: 'Recorded' },
  { value: 'flagged',  label: 'Flagged' },
  { value: 'closed',   label: 'Closed' },
];

// 'awaiting' is deliberately absent: an awaiting event is a pallet still
// standing in the yard, which belongs to the gate board, not the archive.
const DISPATCH_STATUS_OPTIONS = [
  { value: 'collected',      label: 'Collected' },
  { value: 'late_collected', label: 'Collected late' },
  { value: 'not_collected',  label: 'Not collected' },
  { value: 'cancelled',      label: 'Cancelled' },
];

const EMPTY_FILTERS = { from: '', to: '', entity: '', status: '', search: '' };

// Each tab opens on the column that answers "what happened most recently",
// which is what someone looking for a record almost always wants first.
const EMPTY_SORT = {
  in:  { sort: 'delivery_date', dir: 'desc' },
  out: { sort: 'collected_at',  dir: 'desc' },
};

export default function ReceiptsPage() {
  const [tab, setTab]         = useState('in');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [cohort, setCohort]   = useState('');
  const [offset, setOffset]   = useState(0);
  const [sortState, setSortState] = useState(EMPTY_SORT.in);

  // The search box fires on every keystroke, and each one would otherwise be
  // a request. Debounced so a typed PO number is one query rather than twelve.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [supplierOptions, setSupplierOptions]       = useState([]);
  const [beneficiaryOptions, setBeneficiaryOptions] = useState([]);

  const [openDelivery, setOpenDelivery] = useState(null);
  const [openDispatch, setOpenDispatch] = useState(null);
  const [isOpening, setOpening]         = useState(false);
  const [openError, setOpenError]       = useState('');

  // Switching tabs resets everything: a supplier filter means nothing on the
  // goods-out tab, and carrying a stale offset lands you on an empty page.
  const switchTab = (next) => {
    if (next === tab) return;
    setTab(next);
    setFilters(EMPTY_FILTERS);
    setCohort('');
    setOffset(0);
    // Sort keys differ per tab — carrying 'supplier_name' onto goods out would
    // be rejected by the server as an unknown column.
    setSortState(EMPTY_SORT[next]);
    setRows([]);
    setError('');
  };

  // Filter options load once per tab. Failure is non-fatal — the list still
  // works, you just lose one dropdown, so it does not set the page error.
  useEffect(() => {
    let cancelled = false;
    const load = tab === 'in'
      ? receivingAPI.getSupplierOptions()
      : dispatchAPI.getDispatchBeneficiaryOptions();

    load
      .then((data) => {
        if (cancelled) return;
        if (tab === 'in') setSupplierOptions(data || []);
        else setBeneficiaryOptions(data || []);
      })
      .catch((err) => console.error('[receipts] filter options failed', err));

    return () => { cancelled = true; };
  }, [tab]);

  // Fetching lives inside the effect rather than in a useCallback the effect
  // then invokes, for two reasons.
  //
  // The lint one: react-hooks/set-state-in-effect fires on a setState called
  // synchronously in an effect body, and fetchRows() set the loading flag
  // before its first await. ProcurementDashboard hit the same rule earlier in
  // this codebase.
  //
  // The real one: without a cancellation guard, two filter changes in quick
  // succession race. Typing a date fires a request per keystroke on some
  // browsers, and whichever response lands LAST wins — which is not
  // necessarily the one for the filters now on screen. `cancelled` means a
  // superseded response is discarded rather than painted.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Yielding first is what keeps the first setState out of the synchronous
      // effect body.
      await Promise.resolve();
      if (cancelled) return;

      setLoading(true);
      setError('');
      try {
        const result = tab === 'in'
          ? await receivingAPI.getDeliveryArchive({
              from:       filters.from || undefined,
              to:         filters.to || undefined,
              supplierId: filters.entity || undefined,
              status:     filters.status || undefined,
              search:     debouncedSearch || undefined,
              sort:       sortState.sort,
              dir:        sortState.dir,
              limit: PAGE_SIZE, offset,
            })
          : await dispatchAPI.listDispatchNotes({
              from:   filters.from || undefined,
              to:     filters.to || undefined,
              ecdId:  filters.entity || undefined,
              cohort: cohort || undefined,
              status: filters.status || undefined,
              search: debouncedSearch || undefined,
              sort:   sortState.sort,
              dir:    sortState.dir,
              limit: PAGE_SIZE, offset,
            });

        if (cancelled) return;
        setRows(result.rows || []);
        setTotal(result.total || 0);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Something went wrong loading records.');
        setRows([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [tab, filters, cohort, offset, sortState, debouncedSearch]);

  // Changing the order has to return to page one. Page 3 of a list sorted by
  // date is a different set of rows to page 3 of the same list sorted by
  // supplier, so keeping the offset lands you somewhere arbitrary.
  const changeSort = (sort, dir) => {
    setSortState({ sort, dir });
    setOffset(0);
  };

  // Any filter change returns to page one. Staying on page 3 of a result set
  // that now has four rows shows an empty screen and looks like a bug.
  const setFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setOffset(0);
  };

  const openRow = async (row) => {
    setOpening(true);
    setOpenError('');
    try {
      if (tab === 'in') {
        setOpenDelivery(await receivingAPI.getDeliveryById(row.id));
      } else {
        // dispatch_event_id, NOT picking_slip_id — different id spaces.
        setOpenDispatch(await dispatchAPI.getDispatchNote(row.dispatch_event_id));
      }
    } catch (err) {
      setOpenError(err.message || 'Could not open that record.');
    } finally {
      setOpening(false);
    }
  };

  const deliveryColumns = [
    {
      key: 'id', header: 'ID', sortKey: 'id',
      // The note's own record number, matching the "#0011" on the document.
      // Padded so the column reads as a column rather than ragged text.
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          #{String(r.id).padStart(4, '0')}
        </span>
      ),
    },
    { key: 'date',     header: 'Delivered',   sortKey: 'delivery_date',
      render: (r) => formatDateShort(r.delivery_date) },
    { key: 'supplier', header: 'Supplier',    sortKey: 'supplier_name',
      render: (r) => r.supplier_name || 'Unknown supplier' },
    {
      key: 'po', header: 'Purchase order', sortKey: 'po_number',
      // Its own column now, separate from the note ID. po_number is the
      // human reference (PO-2026-0007); purchase_order_id is the fallback for
      // any order raised before po_number was added.
      render: (r) => r.po_number || (r.purchase_order_id ? `#${r.purchase_order_id}` : '—'),
    },
    { key: 'by',       header: 'Received by', sortKey: 'received_by_name',
      render: (r) => r.received_by_name || '—' },
    {
      key: 'status', header: 'Status', sortKey: 'status',
      render: (r) => (
        <div className="flex items-center gap-2">
          {/* Flagged is a problem (red); recorded and closed are done
              (green, told apart by icon and fill); a count difference
              on its own is amber. Styles: lib/statusStyles.js. */}
          <StatusBadge kind="delivery" status={r.status}>
            {DELIVERY_STATUS_LABEL[r.status] || r.status}
          </StatusBadge>
          {r.has_discrepancies && (
            <StatusBadge {...VARIANCE_STYLE}>
              {r.discrepancy_count} variance{Number(r.discrepancy_count) === 1 ? '' : 's'}
            </StatusBadge>
          )}
        </div>
      ),
    },
  ];

  const dispatchColumns = [
    {
      key: 'id', header: 'ID', sortKey: 'id',
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          #{String(r.dispatch_event_id).padStart(4, '0')}
        </span>
      ),
    },
    { key: 'date',   header: 'Dispatch date', sortKey: 'dispatch_date',
      render: (r) => formatDateShort(r.dispatch_date) },
    { key: 'ecd',    header: 'Beneficiary',   sortKey: 'ecd_name',
      render: (r) => r.ecd_name || 'Unknown' },
    { key: 'cohort', header: 'Cohort',        sortKey: 'cohort',
      render: (r) => (r.cohort === 'thursday' ? 'Thursday' : 'Tuesday') },
    { key: 'driver', header: 'Driver',        sortKey: 'driver_name',
      render: (r) => r.driver_name || '—' },
    {
      key: 'status', header: 'Outcome', sortKey: 'status',
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusBadge kind="dispatch" status={r.status}>
            {DISPATCH_STATUS_LABEL[r.status] || r.status}
          </StatusBadge>
          {Number(r.variance_count) > 0 && (
            <StatusBadge {...VARIANCE_STYLE}>
              {r.variance_count} variance{Number(r.variance_count) === 1 ? '' : 's'}
            </StatusBadge>
          )}
        </div>
      ),
    },
  ];

  const entityOptions = tab === 'in'
    ? supplierOptions.map((s) => ({
        value: s.id,
        label: s.is_active === false ? `${s.name} (inactive)` : s.name,
      }))
    : beneficiaryOptions
        .filter((b) => b.ecd_id)   // only ECD rows can be filtered by id
        .map((b) => ({
          value: b.ecd_id,
          label: b.is_active === false ? `${b.name} (offboarded)` : b.name,
        }));

  const pageCount   = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const statusOptions = tab === 'in' ? DELIVERY_STATUS_OPTIONS : DISPATCH_STATUS_OPTIONS;
  const entityLabel = tab === 'in' ? 'Supplier' : 'Beneficiary';
  const entityName = entityOptions.find((o) => String(o.value) === String(filters.entity))?.label;

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setCohort('');
    setOffset(0);
    setSortState(EMPTY_SORT[tab]);
  };
  const narrowed = Boolean(filters.from || filters.to || filters.entity || filters.status || filters.search || cohort);

  // Status is a "+ Filter" item, one at a time (the server takes one);
  // the rest are set in the toolbar and shown as removable chips.
  const chips = [
    filters.entity ? { key: 'entity', label: `${entityLabel}: ${entityName ?? filters.entity}`, onRemove: () => setFilter({ entity: '' }) } : null,
    cohort ? { key: 'cohort', label: cohort === 'thursday' ? 'Thursday cohort' : 'Tuesday cohort', onRemove: () => { setCohort(''); setOffset(0); } } : null,
    filters.from ? { key: 'from', label: `From ${shortDate(filters.from)}`, onRemove: () => setFilter({ from: '' }) } : null,
    filters.to ? { key: 'to', label: `To ${shortDate(filters.to)}`, onRemove: () => setFilter({ to: '' }) } : null,
  ].filter(Boolean);

  // The server pages; the pager is told where it is rather than paging
  // an array itself.
  const pager = {
    page: currentPage,
    pages: pageCount,
    from: total ? offset + 1 : 0,
    to: offset + rows.length,
    total,
    prev: () => setOffset(Math.max(0, offset - PAGE_SIZE)),
    next: () => setOffset(offset + PAGE_SIZE),
  };

  return (
    <PageShell>
      <PageHeader
        title="Receipts"
        description="Find delivery notes for goods in and dispatch notes for goods out."
      />

      <ViewTabs
        className="mt-5"
        label="Receipt type"
        value={tab}
        onChange={switchTab}
        tabs={TABS}
      />

      <ErrorBanner className="mt-4" message={openError} />

      <div className="mt-6">
        <ListCard
          header={
            <ListToolbar
              search={{
                value: filters.search,
                onChange: (v) => setFilter({ search: v }),
                placeholder: tab === 'in'
                  ? 'PO, record no. or supplier'
                  : 'Beneficiary, driver or record',
                label: 'Search receipts',
              }}
              filters={statusOptions.map((o) => ({
                key: o.value,
                label: o.label,
                active: filters.status === o.value,
                onToggle: () => setFilter({ status: filters.status === o.value ? '' : o.value }),
              }))}
              chips={chips}
              onClearAll={clearAll}
            >
              <NativeSelect
                aria-label={entityLabel}
                size="sm"
                className="max-w-48"
                value={filters.entity}
                onChange={(e) => setFilter({ entity: e.target.value })}
              >
                <option value="">Any {entityLabel.toLowerCase()}</option>
                {entityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </NativeSelect>
              {tab === 'out' ? (
                <NativeSelect
                  aria-label="Cohort"
                  size="sm"
                  value={cohort}
                  onChange={(e) => { setCohort(e.target.value); setOffset(0); }}
                >
                  <option value="">Any cohort</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="thursday">Thursday</option>
                </NativeSelect>
              ) : null}
              <Input
                type="date" aria-label="From" title="From" className="h-8 w-auto"
                value={filters.from} onChange={(e) => setFilter({ from: e.target.value })}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date" aria-label="To" title="To" className="h-8 w-auto"
                value={filters.to} onChange={(e) => setFilter({ to: e.target.value })}
              />
            </ListToolbar>
          }
          footer={!isLoading && !error && rows.length
            ? <TablePager {...pager} noun={tab === 'in' ? 'delivery notes' : 'dispatch notes'} loading={isOpening} alwaysShow />
            : null}
        >
          <ReceiptsTable
            columns={tab === 'in' ? deliveryColumns : dispatchColumns}
            rows={rows}
            rowKey={(r) => (tab === 'in' ? `d-${r.id}` : `x-${r.dispatch_event_id}`)}
            onOpen={openRow}
            isLoading={isLoading || isOpening}
            error={error}
            sort={sortState.sort}
            dir={sortState.dir}
            onSortChange={changeSort}
            emptyMessage={
              tab === 'in'
                ? 'No delivery notes match these filters.'
                : 'No dispatch notes match these filters.'
            }
            emptyAction={narrowed ? { label: 'Clear all filters', onClick: clearAll } : undefined}
          />
        </ListCard>
      </div>

      {openDelivery && (
        <DeliveryNotePDF delivery={openDelivery} onClose={() => setOpenDelivery(null)} />
      )}
      {openDispatch && (
        <DispatchNotePDF note={openDispatch} onClose={() => setOpenDispatch(null)} />
      )}
    </PageShell>
  );
}
