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
import { useNavigate } from 'react-router-dom';
import ReceiptFilters from '../features/receipts/components/ReceiptFilters';
import ReceiptsTable from '../features/receipts/components/ReceiptsTable';
import StatusPill from '../features/receipts/components/StatusPill';
import DeliveryNotePDF from '../features/procurement/components/DeliveryNotePDF';
import DispatchNotePDF from '../features/receipts/components/DispatchNotePDF';
import {
  formatDateShort, DISPATCH_STATUS_LABEL, DELIVERY_STATUS_LABEL,
} from '../features/receipts/components/noteFormat';
import receivingAPI from '../services/receivingAPI';
import dispatchAPI from '../services/dispatchAPI';

const PAGE_SIZE = 25;

const TABS = [
  { id: 'in',  label: 'Goods in',  sub: 'Delivery notes' },
  { id: 'out', label: 'Goods out', sub: 'Dispatch notes' },
];

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
  const navigate = useNavigate();

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
        <span className="font-mono text-xs text-[#676767]">
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
          <StatusPill tone={r.status === 'flagged' ? 'warn' : 'neutral'}>
            {DELIVERY_STATUS_LABEL[r.status] || r.status}
          </StatusPill>
          {r.has_discrepancies && (
            <StatusPill tone="warn">
              {r.discrepancy_count} variance{Number(r.discrepancy_count) === 1 ? '' : 's'}
            </StatusPill>
          )}
        </div>
      ),
    },
  ];

  const dispatchColumns = [
    {
      key: 'id', header: 'ID', sortKey: 'id',
      render: (r) => (
        <span className="font-mono text-xs text-[#676767]">
          #{String(r.dispatch_event_id).padStart(4, '0')}
        </span>
      ),
    },
    { key: 'date',   header: 'Dispatch date', sortKey: 'dispatch_date',
      render: (r) => formatDateShort(r.dispatch_date) },
    { key: 'ecd',    header: 'Beneficiary',   sortKey: 'ecd_name',
      render: (r) => r.ecd_name || 'Unknown' },
    { key: 'cohort', header: 'Cohort',        sortKey: 'cohort',
      render: (r) => (r.cohort === 'week2' ? 'Week 2' : 'Week 1') },
    { key: 'driver', header: 'Driver',        sortKey: 'driver_name',
      render: (r) => r.driver_name || '—' },
    {
      key: 'status', header: 'Outcome', sortKey: 'status',
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusPill
            tone={
              r.status === 'collected' ? 'good'
                : r.status === 'not_collected' ? 'warn'
                  : r.status === 'late_collected' ? 'warn' : 'muted'
            }
          >
            {DISPATCH_STATUS_LABEL[r.status] || r.status}
          </StatusPill>
          {Number(r.variance_count) > 0 && (
            <StatusPill tone="warn">
              {r.variance_count} variance{Number(r.variance_count) === 1 ? '' : 's'}
            </StatusPill>
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

  return (
    <>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#2b3336]">Receipts</h1>
          <p className="mt-1 text-sm text-[#676767]">
            Delivery notes for stock that came in, and dispatch notes for stock that went out.
          </p>
        </div>

        {/* ── Tabs ───────────────────────────────────────────
            Buttons rather than a Tabs primitive — components/ui has no
            tabs.jsx, and adding one shadcn component for two buttons is
            more surface area than it earns. */}
        <div
          className="mb-5 flex gap-2 border-b-2 border-[#e9e3dd]"
          role="tablist"
          aria-label="Receipt type"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => switchTab(t.id)}
              className={`-mb-0.5 border-b-4 px-4 py-2 text-left transition-colors ${
                tab === t.id
                  ? 'border-[#ef3a40] text-[#2b3336]'
                  : 'border-transparent text-[#676767] hover:text-[#2b3336]'
              }`}
            >
              <span className="block text-sm font-bold">{t.label}</span>
              <span className="block text-[11px]">{t.sub}</span>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <ReceiptFilters
            from={filters.from}
            to={filters.to}
            onFromChange={(v) => setFilter({ from: v })}
            onToChange={(v) => setFilter({ to: v })}
            status={filters.status}
            statusOptions={tab === 'in' ? DELIVERY_STATUS_OPTIONS : DISPATCH_STATUS_OPTIONS}
            onStatusChange={(v) => setFilter({ status: v })}
            entityLabel={tab === 'in' ? 'Supplier' : 'Beneficiary'}
            entityValue={filters.entity}
            entityOptions={entityOptions}
            onEntityChange={(v) => setFilter({ entity: v })}
            search={filters.search}
            onSearchChange={(v) => setFilter({ search: v })}
            searchPlaceholder={tab === 'in'
              ? 'PO number, record number or supplier…'
              : 'Beneficiary, driver, pallet or record number…'}
            resultCount={total}
            isLoading={isLoading}
            onClear={() => {
              setFilters(EMPTY_FILTERS);
              setCohort('');
              setOffset(0);
              setSortState(EMPTY_SORT[tab]);
            }}
            extra={tab === 'out' ? (
              <div>
                <label
                  className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#676767]"
                  htmlFor="receipts-cohort"
                >
                  Cohort
                </label>
                <select
                  id="receipts-cohort"
                  className="w-full rounded-[4px] border-2 border-[#e9e3dd] bg-white px-3 py-2 text-sm text-[#2b3336] focus:border-[#2b3336] focus:outline-none"
                  value={cohort}
                  onChange={(e) => { setCohort(e.target.value); setOffset(0); }}
                >
                  <option value="">All</option>
                  <option value="week1">Week 1</option>
                  <option value="week2">Week 2</option>
                </select>
              </div>
            ) : null}
          />
        </div>

        {openError && (
          <div className="mb-4 rounded-[4px] border-2 border-[#ef3a40] bg-[#fdf1f1] p-3 text-sm text-[#2b3336]">
            {openError}
          </div>
        )}

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
        />

        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-[4px] border-2 border-[#2b3336] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#2b3336] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-[#676767]">
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-[4px] border-2 border-[#2b3336] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#2b3336] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-xs font-bold uppercase tracking-wider text-[#676767] hover:text-[#2b3336]"
          >
            ← Back
          </button>
        </div>
      </main>

      {openDelivery && (
        <DeliveryNotePDF delivery={openDelivery} onClose={() => setOpenDelivery(null)} />
      )}
      {openDispatch && (
        <DispatchNotePDF note={openDispatch} onClose={() => setOpenDispatch(null)} />
      )}
    </>
  );
}
