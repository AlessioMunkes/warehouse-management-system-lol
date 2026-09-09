import usePdfDocument from '../../staff/hooks/usePdfDocument';
import '../../../styles/deliveryNotePDF.css';

// ─────────────────────────────────────────────────────────────
// src/features/procurement/components/DeliveryNotePDF.jsx
//
// A recorded delivery, as a printable note.
//
// WHAT CHANGED AND WHY IT MATTERED
// The items table used to print ONLY expected_quantity and
// expected_weight_kg — the purchase order's numbers. The repository
// returns received_quantity, received_weight_kg, discrepancy_quantity
// and discrepancy_reason, and none of them reached the page. A note
// for a short delivery therefore reprinted the order and showed no
// sign anything was wrong, which is the exact opposite of what a
// proof-of-delivery document is for.
//
// items_from_purchase_order was ignored too. It is TRUE when the
// lines were read off the purchase order because the note has no
// delivery_note_items of its own, and delivery.repository.js sets it
// specifically so this component can refuse to present those
// quantities as a record of what physically arrived. It now does.
//
// The modal chrome and jsPDF export moved to features/receipts/
// components/PdfShell.jsx, which the dispatch note shares.
// ─────────────────────────────────────────────────────────────
import PdfShell from '../../receipts/components/PdfShell';
import {
  formatDate, formatDateTime, fmtQty, variance, qty,
} from '../../receipts/components/noteFormat';

// A public asset, not an import — same convention StaffShell.jsx uses
// for /images/BatchesLogo.png. Lives in client/public/images/.
const PDF_LOGO_URL = '/images/pdf_logo.png';

// Hardcoded to the one warehouse this app currently operates against.
// A real multi-warehouse setup (a warehouses table, tracking which
// location the signed-in session belongs to) would replace this with
// a lookup — worth doing once there's more than one warehouse to pick
// between, not before.
const WAREHOUSE = {
  name: 'Ladles of Love — Cape Town Warehouse',
  addressLines: ['Unit 4, Hewett Park', '17 Hewett Ave, Epping', 'Cape Town, 7460'],
  phone: '',
};

// Suppliers don't reliably have a real address/phone on file yet — the
// columns exist (server/src/repositories/delivery.repository.js joins
// them in) but most rows are still unpopulated. Rather than leave the
// From block half-empty, this fills the gap with a clearly-generic
// placeholder until real data exists; once a supplier's own address/
// phone is saved, delivery.supplier_address/_phone come through from
// the query above and this fallback is never reached for that row.
const DUMMY_SUPPLIER_ADDRESS = 'Cape Town, South Africa';
const DUMMY_SUPPLIER_PHONE = '021 000 0000';

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const DeliveryNotePDF = ({ delivery, onClose }) => {
  const { documentRef, isGenerating, error: genError, openPdf: handleViewPdf } = usePdfDocument();

  if (!delivery) return null;

  // Treats either terminal spelling as "done": the codebase currently
  // has two purchase_orders lifecycles that disagree with each other
  // (one write path uses 'completed', BR-07B's own PO_STATUSES list
  // calls the same state 'received') — this stays defensive until
  // that's resolved with the team, rather than betting on one.
  const isCompleted = delivery.po_status === 'completed' || delivery.po_status === 'received';

  const additionalInfo = delivery.has_discrepancies
    ? `This delivery did not fully match the purchase order${
        delivery.discrepancy_count
          ? ` — ${delivery.discrepancy_count} line${delivery.discrepancy_count === 1 ? '' : 's'} varied from what was expected, detailed below`
          : ''
      }. A manager has been notified to follow up.`
    : isCompleted
      ? 'All items on this purchase order have been delivered in full and the order is now closed.'
      : 'This is one delivery recorded against the purchase order above. The order is not yet fully delivered and may have further deliveries recorded against it.';
// The PO states that mean nothing further is expected. 'completed' is legacy
// — still legal in the database, no longer written. See
// server/src/constants/purchaseOrderStatus.js.
const CLOSED_PO_STATUSES = ['received', 'completed'];

const DeliveryNotePDF = ({ delivery, onClose }) => {
  if (!delivery) return null;

  const items      = delivery.items || [];
  const isClosed   = CLOSED_PO_STATUSES.includes(delivery.po_status);
  const fromPO     = Boolean(delivery.items_from_purchase_order);
  const isFlagged  = delivery.status === 'flagged';

  const variedCount = items.filter(
    (i) => variance(i.received_quantity, i.expected_quantity) !== null
  ).length;

  const totalExpected = items.reduce((sum, i) => sum + (qty(i.expected_quantity) ?? 0), 0);
  const totalReceived = items.reduce((sum, i) => sum + (qty(i.received_quantity) ?? 0), 0);

  return (
    <PdfShell
      title={`DELIVERY NOTE #${delivery.id} — ${delivery.supplier_name || 'Unknown supplier'}`}
      filename={`delivery-note-${delivery.id}`}
      onClose={onClose}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="pdf-doc-header">
        <div>
          <h1 className="pdf-doc-title">DELIVERY NOTE</h1>
          <p className="pdf-doc-subtitle">Ladles of Love · Nourish Our Children</p>
          <p className="pdf-doc-subtitle">Warehouse Management System</p>
        </div>
        <div>
          <p className="pdf-doc-id-label">Record number</p>
          <p className="pdf-doc-id">#{String(delivery.id).padStart(4, '0')}</p>
          <p className="pdf-doc-id-label pdf-doc-id-label--spaced">
            Recorded: {formatDateTime(delivery.created_at)}
          </p>
        </div>
      </div>

      {/* ── Provenance warning ─────────────────────────────────
          Only when the lines are the ORDER, not the delivery. Zero
          notes are in this state today, but a document that quietly
          passes off ordered quantities as received ones is precisely
          the failure this whole feature exists to prevent. */}
      {fromPO && (
        <div className="pdf-status-banner pdf-status-banner--warning">
          <p className="pdf-status-title pdf-status-title--pending">
            Quantities below are what was ORDERED
          </p>
          <p className="pdf-status-body">
            This note has no line items of its own, so the figures are taken from
            purchase order #{delivery.po_id || delivery.purchase_order_id}. They are not a
            record of what physically arrived, and no variance can be shown.
          </p>
        </div>
      )}

      {/* ── Discrepancy summary ────────────────────────────── */}
      {!fromPO && variedCount > 0 && (
        <div className="pdf-status-banner pdf-status-banner--warning">
          <p className="pdf-status-title pdf-status-title--pending">
            {variedCount} line{variedCount === 1 ? '' : 's'} did not match the order
          </p>
          <p className="pdf-status-body">
            What was received is what went into stock. Each variance and its recorded
            reason are shown against the line below.
          </p>
        </div>
      )}

      {/* ── PO status ──────────────────────────────────────── */}
      <div className={`pdf-status-banner ${isClosed ? 'pdf-status-banner--complete' : 'pdf-status-banner--pending'}`}>
        {isClosed ? (
          <>
            <p className="pdf-status-title pdf-status-title--complete">
              Purchase order {delivery.po_number || `#${delivery.po_id}`} — closed off
            </p>
            <p className="pdf-status-body pdf-status-body--complete">
              Nothing further is expected against this order.
            </p>
          </>
        ) : (
          <>
            <p className="pdf-status-title pdf-status-title--pending">
              Purchase order {delivery.po_number || `#${delivery.po_id}`} — still open
            </p>
            <p className="pdf-status-body pdf-status-body--pending">
              This is delivery #{delivery.id} against the order. It has not been closed off
              and further deliveries may still be recorded.
            </p>
          </>
        )}
      </div>

      {/* ── Meta ───────────────────────────────────────────── */}
      <div className="pdf-meta-grid">
        <div>
          <p className="pdf-meta-label">Supplier</p>
          <p className="pdf-meta-value">{delivery.supplier_name || '—'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Delivery date</p>
          <p className="pdf-meta-value">{formatDate(delivery.delivery_date)}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Status</p>
          <p className="pdf-meta-value">{isFlagged ? 'Flagged for review' : 'Recorded'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Received by</p>
          <p className="pdf-meta-value">{delivery.received_by_name || '—'}</p>
        </div>
        <div>
          {/* delivery_notes.driver_name exists but createDelivery has never
              written it — the receiving flow captures no driver. Shown so the
              gap is visible rather than hidden. */}
          <p className="pdf-meta-label">Driver</p>
          <p className="pdf-meta-value">{delivery.driver_name || 'Not recorded'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Purchase order</p>
          <p className="pdf-meta-value">
            {delivery.po_number || `#${delivery.po_id || delivery.purchase_order_id || '—'}`}
          </p>
        </div>
      </div>

      {/* ── Items ──────────────────────────────────────────── */}
      <p className="pdf-items-title">
        {fromPO ? 'Items ordered' : 'Items received'}
      </p>
      <table className="pdf-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th className="pdf-table-center">Ordered</th>
            {!fromPO && <th className="pdf-table-center">Received</th>}
            <th className="pdf-table-center">Unit</th>
            {!fromPO && <th className="pdf-table-center">Variance</th>}
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((item, i) => {
              const v   = fromPO ? null : variance(item.received_quantity, item.expected_quantity);
              const key = item.delivery_note_item_id ?? item.purchase_order_item_id ?? i;
              return [
                <tr key={key} className={v ? 'pdf-table-row--variance' : undefined}>
                  <td className="pdf-table-product">{item.product_name}</td>
                  <td className="pdf-table-sku">{item.sku || '—'}</td>
                  <td className="pdf-table-center">{fmtQty(item.expected_quantity)}</td>
                  {!fromPO && (
                    <td className="pdf-table-center">{fmtQty(item.received_quantity)}</td>
                  )}
                  <td className="pdf-table-center">{item.unit || '—'}</td>
                  {!fromPO && (
                    <td className={`pdf-table-center ${v ? v.className : 'pdf-variance-none'}`}>
                      {v ? v.label : 'Matched'}
                    </td>
                  )}
                </tr>,
                // The reason sits under its own line rather than in a column,
                // so it has room to be a sentence instead of a truncated cell.
                v && item.discrepancy_reason ? (
                  <tr key={`${key}-reason`} className="pdf-reason-row">
                    <td colSpan={fromPO ? 4 : 6}>
                      <span className="pdf-reason-label">Reason </span>
                      {item.discrepancy_reason}
                      {item.discrepancy_resolved ? ' · resolved' : ' · unresolved'}
                    </td>
                  </tr>
                ) : null,
              ];
            })
          ) : (
            <tr>
              <td colSpan={fromPO ? 4 : 6} className="pdf-table-empty">
                No items on record
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {items.length > 0 && (
        <div className="pdf-totals-row">
          <div className="pdf-total-block">
            <p className="pdf-meta-label">Total ordered</p>
            <p className="pdf-meta-value">{fmtQty(totalExpected)}</p>
          </div>
          {!fromPO && (
            <div className="pdf-total-block">
              <p className="pdf-meta-label">Total received</p>
              <p className="pdf-meta-value">{fmtQty(totalReceived)}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Signatures ─────────────────────────────────────── */}
      <div className="pdf-signature-section">
        <div className="pdf-signature-block">
          <p className="pdf-signature-label">Driver signature</p>
          {delivery.signature ? (
            <img src={delivery.signature} alt="Driver signature" className="pdf-signature-img" />
          ) : (
            <div className="pdf-signature-line" />
          )}
          <p className="pdf-signature-name">
            {delivery.driver_name || 'Driver'} · {formatDate(delivery.delivery_date)}
          </p>
        </div>
        <div className="pdf-signature-block">
          <p className="pdf-signature-label">Received by (warehouse)</p>
          <div className="pdf-signature-line" />
          <p className="pdf-signature-name">
            {delivery.received_by_name || 'Warehouse staff'} · {formatDate(delivery.delivery_date)}
          </p>
        </div>
      </div>

      <div className="pdf-footer-stamp">
        <p>Ladles of Love NGO · Warehouse Management System</p>
        <p className="pdf-footer-stamp--spaced">
          Generated {formatDateTime(new Date().toISOString())} · Record #{delivery.id}
        </p>
      </div>
    </PdfShell>
  );
};

export default DeliveryNotePDF;
