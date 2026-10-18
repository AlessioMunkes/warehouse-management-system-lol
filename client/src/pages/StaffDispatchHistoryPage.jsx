// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffDispatchHistoryPage.jsx
//
// The dispatch equivalent of StaffDeliveriesPage.jsx /
// StaffDecantingRecordsPage.jsx: every dispatch that reached a terminal
// state — collected, late, not collected, cancelled — filterable by how
// far back to look. Collected ones open as the same DispatchNotePDF
// that pops up right after a collection in PalletCheck.jsx; the others
// have no note to open, because no goods left the building.
//
// Pallets still awaiting collection are NOT here. They are on the gate
// queue, which is the screen that acts on them.
//
// Reached from a "History" link on the gate queue's crumb bar — see
// routes/paths.js's STAFF.dispatchHistory comment for why this isn't
// its own tab bar slot.
//
// Read-only, same reasoning as the other history pages: getHistory
// returns everything in the requested range in one call, and
// HistoryScreen sorts and filters it in the browser.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DispatchNotePDF from '../features/receipts/DispatchNotePDF';
import dispatchAPI from '../services/dispatchAPI';
import { STAFF } from '../routes/paths';
import HistoryScreen, { HistoryRow } from '../features/staff/HistoryScreen';
import { byNewest, byOldest, byText } from '../features/staff/historyView';
import StatusBadge from '@/components/ui/status-badge';
import { workerStatus } from '../features/staff/workerStatus';
import { formatShortDate as formatDate } from '@/lib/dates';

// One entry per terminal dispatch_events.status. `note` is whether a
// dispatch note exists to open: nothing was loaded for the two that
// never left, so offering "View note" on them would be a dead button.
const STATUS_META = {
  collected:      { label: 'Collected',     note: true  },
  late_collected: { label: 'Late',          note: true  },
  not_collected:  { label: 'Not collected', note: false },
  cancelled:      { label: 'Cancelled',     note: false },
};

const kindLabel = (kind) => {
  if (!kind) return '';
  if (kind === 'ecd') return 'ECD';
  const words = kind.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// collected_at for the two that moved; dispatch_date for the two that
// did not, which is the only date those rows have.
const dateOf = (row) => row.collected_at ?? row.dispatch_date;

const SORTS = [
  { key: 'newest', label: 'Newest first', compare: byNewest(dateOf) },
  { key: 'oldest', label: 'Oldest first', compare: byOldest(dateOf) },
  { key: 'recipient', label: 'Recipient A to Z', compare: byText((r) => r.ecd_name) },
];
const FILTERS = [
  { key: 'status', label: 'Status', valueOf: (r) => r.status, labelOf: (v) => STATUS_META[v]?.label ?? v },
  { key: 'recipient', label: 'Went to', valueOf: (r) => r.ecd_name },
  { key: 'kind', label: 'Type', valueOf: (r) => r.beneficiary_kind, labelOf: kindLabel },
  { key: 'driver', label: 'Driver', valueOf: (r) => r.driver_name },
];
const searchText = (r) => [r.ecd_name, r.pallet_ref, r.driver_name].filter(Boolean).join(' ');

export default function StaffDispatchHistoryPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState('week');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [pdfNote, setPdfNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await dispatchAPI.getHistory(range);
        if (!cancelled) setHistory(list);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const openPdf = async (eventId) => {
    setOpeningId(eventId);
    setError(null);
    try {
      const full = await dispatchAPI.getDispatchNote(eventId);
      setPdfNote(full);
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <StaffShell
      crumb="Dispatch / History"
      onBack={() => navigate(STAFF.dispatch)}
    >
      <HistoryScreen
        title="Dispatch history"
        sub="Every dispatch that's been closed off. Pallets still waiting are on the gate queue."
        error={error}
        range={range}
        onRangeChange={setRange}
        loading={loading}
        rows={history}
        rowKey={(row) => row.dispatch_event_id}
        search={searchText}
        searchPlaceholder="Search by recipient, pallet or driver"
        searchId="stf-dispatch-search"
        sorts={SORTS}
        filters={FILTERS}
        empty="No dispatches recorded in this range yet."
        noun="dispatches"
        renderRow={(row) => {
          const meta = STATUS_META[row.status];
          return (
            <HistoryRow
              title={`${row.ecd_name}${row.pallet_ref ? ` · ${row.pallet_ref}` : ''}`}
              meta={[
                formatDate(dateOf(row)),
                row.driver_name,
                row.beneficiary_kind && row.beneficiary_kind !== 'ecd' ? kindLabel(row.beneficiary_kind) : null,
                // No note exists for a pallet that never left; the
                // reason is what there is to show instead.
                !meta?.note && row.override_reason ? row.override_reason : null,
              ].filter(Boolean).join(' · ')}
              badges={(
                <StatusBadge {...workerStatus('dispatch', row.status)}>
                  {meta?.label ?? row.status}
                </StatusBadge>
              )}
              action={meta?.note
                ? { label: 'View note', onClick: () => openPdf(row.dispatch_event_id), busy: openingId === row.dispatch_event_id }
                : null}
            />
          );
        }}
      />

      {pdfNote ? (
        <DispatchNotePDF note={pdfNote} onClose={() => setPdfNote(null)} />
      ) : null}
    </StaffShell>
  );
}
