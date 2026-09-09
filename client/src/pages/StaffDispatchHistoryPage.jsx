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
// Deliberately read-only and un-paginated, same reasoning as the
// other two history pages: getHistory already returns everything in
// the requested range in one call.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DispatchNotePDF from '../features/dispatch/components/DispatchNotePDF';
import { Notice } from '../features/staff/components/StepPrimitives';
import dispatchAPI from '../services/dispatchAPI';
import { STAFF } from '../routes/paths';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all',   label: 'All' },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// One entry per terminal dispatch_events.status. `note` is whether a
// dispatch note exists to open: nothing was loaded for the two that
// never left, so offering "View note" on them would be a dead button.
const STATUS_META = {
  collected:      { label: 'Collected',     tone: 'is-done',   note: true  },
  late_collected: { label: 'Late',          tone: 'is-warn',   note: true  },
  not_collected:  { label: 'Not collected', tone: 'is-warn',   note: false },
  cancelled:      { label: 'Cancelled',     tone: 'is-active', note: false },
};

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
      <div className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Dispatch history</h1>
          <p className="stf-step-sub">
            Every dispatch that's been closed off — collected, late, not collected
            or cancelled — most recent first. Pallets still waiting are on the gate queue.
          </p>
        </div>

        {error ? <Notice tone="warn">{error}</Notice> : null}

        <div className="stf-segments" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={`stf-segment${range === r.key ? ' is-active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="stf-skeleton" aria-label="Loading" />
        ) : history.length === 0 ? (
          <div className="stf-empty">
            No dispatches recorded in this range yet.
          </div>
        ) : (
          <div className="stf-list">
            {history.map((row) => (
              <div key={row.dispatch_event_id} className="stf-row is-static">
                <span className="stf-row-main">
                  <span className="stf-row-title">
                    {row.ecd_name}
                    {row.pallet_ref ? ` · ${row.pallet_ref}` : ''}
                  </span>
                  <span className="stf-row-meta">
                    {/* collected_at for the two that moved; dispatch_date
                        for the two that did not, which is the only date
                        those rows have. */}
                    {formatDate(row.collected_at ?? row.dispatch_date)}
                    {row.driver_name ? ` · ${row.driver_name}` : ''}
                    {row.beneficiary_kind && row.beneficiary_kind !== 'ecd'
                      ? ` · ${row.beneficiary_kind.replace(/_/g, ' ')}`
                      : ''}
                  </span>
                </span>
                <span className={`stf-badge ${STATUS_META[row.status]?.tone ?? 'is-active'}`}>
                  {STATUS_META[row.status]?.label ?? row.status}
                </span>
                {STATUS_META[row.status]?.note ? (
                  <button
                    type="button"
                    className="stf-btn stf-btn-secondary"
                    onClick={() => openPdf(row.dispatch_event_id)}
                    disabled={openingId === row.dispatch_event_id}
                  >
                    {openingId === row.dispatch_event_id ? 'Opening…' : 'View note'}
                  </button>
                ) : (
                  /* No note exists for a pallet that never left — the
                     reason is what there is to show instead. */
                  <span className="stf-row-meta">{row.override_reason || '—'}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {pdfNote ? (
        <DispatchNotePDF note={pdfNote} onClose={() => setPdfNote(null)} />
      ) : null}
    </StaffShell>
  );
}
