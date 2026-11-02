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
// Read-only. GET /api/deliveries returns everything in the requested
// range in one call; search, sort and the filters (status, supplier,
// who received it) narrow that in the browser. The layout is
// HistoryScreen's, shared by every worker history.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DeliveryNotePDF from '../features/receiving/DeliveryNotePDF';
import receivingAPI from '../services/receivingAPI';
import { STAFF } from '../routes/paths';
import HistoryScreen, { HistoryRow } from '../features/staff/HistoryScreen';
import { byNewest, byOldest, byText } from '../features/staff/historyView';
import StatusBadge from '@/components/ui/status-badge';
import { workerStatus } from '../features/staff/workerStatus';
import { formatShortDate as formatDate, formatShortDateTime } from '@/lib/dates';

// Per delivery, the same rule and words as the note and the Receipts
// list (deliveryStatusLabel): a line that came in short makes it partial.
const badgeFor = (delivery) => (
  Number(delivery.short_count) > 0
    ? { status: 'partial', label: 'Partially received' }
    : { status: 'completed', label: 'Completed' }
);

const dateOf = (d) => d.delivered_at ?? d.delivery_date ?? d.created_at;

// Module level so their identity is stable across renders.
const SORTS = [
  { key: 'newest', label: 'Newest first', compare: byNewest(dateOf) },
  { key: 'oldest', label: 'Oldest first', compare: byOldest(dateOf) },
  { key: 'supplier', label: 'Supplier A to Z', compare: byText((d) => d.supplier_name) },
];
const FILTERS = [
  {
    key: 'status', label: 'Status',
    // A discrepancy is its own choice: it is what someone goes looking for.
    valueOf: (d) => (d.status === 'flagged' ? 'discrepancy' : badgeFor(d).status),
    labelOf: (v) => ({ completed: 'Completed', partial: 'Partially received', discrepancy: 'Discrepancy' }[v] ?? v),
  },
  { key: 'supplier', label: 'Supplier', valueOf: (d) => d.supplier_name },
  { key: 'receivedBy', label: 'Received by', valueOf: (d) => d.received_by_name },
];
const searchText = (d) => [d.supplier_name, d.po_number, d.received_by_name].filter(Boolean).join(' ');

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
      <HistoryScreen
        title="Past deliveries"
        sub="Every delivery note that's been recorded."
        error={error}
        range={range}
        onRangeChange={setRange}
        loading={loading}
        rows={deliveries}
        search={searchText}
        searchPlaceholder="Search by supplier, order number or name"
        searchId="stf-deliveries-search"
        sorts={SORTS}
        filters={FILTERS}
        empty="No deliveries recorded in this range yet."
        noun="deliveries"
        renderRow={(delivery) => {
          const badge = badgeFor(delivery);
          return (
            <HistoryRow
              title={delivery.supplier_name}
              meta={[
                delivery.delivered_at ? formatShortDateTime(delivery.delivered_at) : formatDate(delivery.delivery_date),
                delivery.po_number,
                delivery.received_by_name ? `Received by ${delivery.received_by_name}` : null,
              ].filter(Boolean).join(' · ')}
              badges={(
                <>
                  <StatusBadge {...workerStatus('delivery', badge.status)}>{badge.label}</StatusBadge>
                  {/* A count discrepancy is a separate, orthogonal fact
                      from whether the order is complete — an over-count
                      can still fully satisfy the order, so this shows
                      alongside the completion badge, not instead of it. */}
                  {delivery.status === 'flagged' ? (
                    <StatusBadge {...workerStatus('delivery', 'discrepancy')}>Discrepancy</StatusBadge>
                  ) : null}
                </>
              )}
              action={{ label: 'View note', onClick: () => openPdf(delivery.id), busy: openingId === delivery.id }}
            />
          );
        }}
      />

      {pdfDelivery ? (
        <DeliveryNotePDF delivery={pdfDelivery} onClose={() => setPdfDelivery(null)} />
      ) : null}
    </StaffShell>
  );
}
