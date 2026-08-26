// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffDeliveriesPage.jsx
//
// The staff-facing record of what's already been received: every
// delivery note, filterable by how far back to look, each one
// openable as the same DeliveryNotePDF that pops up right after a
// submit in ReceivingFlow — so a worker who closed that pop-up (or
// who's looking for a delivery from an earlier shift) can still get
// back to it. Reached from a link on Receiving's first screen, not
// from its own tab bar slot — see routes/paths.js's STAFF.deliveries
// comment for why.
//
// Deliberately read-only and un-paginated: GET /api/deliveries
// already returns everything in the requested range in one call
// (ProcurementDashboard's own equivalent screen never paginates
// either), and a manager-side version of this page — filters, totals,
// the ability to act on a flagged delivery — is a later, separate
// piece of work, not something to half-build here.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DeliveryNotePDF from '../features/procurement/components/DeliveryNotePDF';
import { Notice } from '../features/staff/components/StepPrimitives';
import receivingAPI from '../services/receivingAPI';
import { STAFF } from '../routes/paths';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all',   label: 'All' },
];

// The badge people actually want to read here is "did the order this
// delivery belongs to get fully delivered" — not "recorded", which is
// just delivery_notes' own bookkeeping status and true of every row.
// isPoComplete treats either terminal spelling as done: the codebase
// currently has TWO purchase_orders lifecycles disagreeing with each
// other (one path writes 'completed', BR-07B's own PO_STATUSES list
// calls it 'received' instead) — this is deliberately defensive until
// that's settled with the team, not a guess at which one wins.
const isPoComplete = (poStatus) => poStatus === 'completed' || poStatus === 'received';

const badgeFor = (delivery) => (
  isPoComplete(delivery.po_status)
    ? { className: 'stf-badge is-done', label: 'Completed' }
    : { className: 'stf-badge is-active', label: 'Partially delivered' }
);

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function StaffDeliveriesPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState('week');
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [pdfDelivery, setPdfDelivery] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await receivingAPI.getDeliveries(range);
        if (!cancelled) setDeliveries(list);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const openPdf = async (id) => {
    setOpeningId(id);
    setError(null);
    try {
      const full = await receivingAPI.getDeliveryById(id);
      setPdfDelivery(full);
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <StaffShell
      crumb="Receiving / Past deliveries"
      onBack={() => navigate(STAFF.receiving)}
    >
      <div className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Past deliveries</h1>
          <p className="stf-step-sub">Every delivery note that's been recorded, most recent first.</p>
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
        ) : deliveries.length === 0 ? (
          <div className="stf-empty">
            No deliveries recorded in this range yet.
          </div>
        ) : (
          <div className="stf-list">
            {deliveries.map((delivery) => {
              const badge = badgeFor(delivery);
              return (
                <div key={delivery.id} className="stf-row is-static">
                  <span className="stf-row-main">
                    <span className="stf-row-title">{delivery.supplier_name}</span>
                    <span className="stf-row-meta">
                      {formatDate(delivery.delivery_date)}
                      {delivery.received_by_name ? ` · Received by ${delivery.received_by_name}` : ''}
                    </span>
                  </span>
                  <span className={badge.className}>{badge.label}</span>
                  {/* A count discrepancy is a separate, orthogonal fact
                      from whether the order is complete — an over-count
                      can still fully satisfy the order, so this shows
                      alongside the completion badge, not instead of it. */}
                  {delivery.status === 'flagged' ? (
                    <span className="stf-badge is-warn">Discrepancy</span>
                  ) : null}
                  <button
                    type="button"
                    className="stf-btn stf-btn-secondary"
                    onClick={() => openPdf(delivery.id)}
                    disabled={openingId === delivery.id}
                  >
                    {openingId === delivery.id ? 'Opening…' : 'View note'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pdfDelivery ? (
        <DeliveryNotePDF delivery={pdfDelivery} onClose={() => setPdfDelivery(null)} />
      ) : null}
    </StaffShell>
  );
}
