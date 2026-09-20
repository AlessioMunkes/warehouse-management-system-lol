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
//
// The letterhead (logo + warehouse address) moved with it and was
// left out of the new header — restored below, same asset and
// address deliveryNotePDF.css's older template used.
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
const WAREHOUSE_ADDRESS = ['Unit 4, Hewett Park', '17 Hewett Ave, Epping', 'Cape Town, 7460'];

// The PO states that mean nothing further is expected. 'received' is not
// one of them — it is not in purchase_orders_status_check at all. See
// server/src/constants/purchaseOrderStatus.js.
const CLOSED_PO_STATUSES = ['completed', 'returned'];

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
      title={`DELIVERY NOTE #${delivery.id} - ${delivery.supplier_name || 'Unknown supplier'}`}
      filename={`delivery-note-${delivery.id}`}
      onClose={onClose}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="pdf-doc-header">
        <div>
          <h1 className="pdf-doc-title">DELIVERY NOTE</h1>
          <p className="pdf-doc-subtitle">Ladles of Love · Nourish Our Children</p>
          {WAREHOUSE_ADDRESS.map((line) => (
            <p key={line} className="pdf-doc-address">{line}</p>
          ))}
        </div>
        <img src={PDF_LOGO_URL} alt="" className="pdf-doc-logo" aria-hidden="true" />
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

      {/* ── Meta ───────────────────────────────────────────── */}
      {/* PO open/closed used to be its own red-or-grey banner above
          this grid — full-width real estate for a fact that is
          neutral information, not a flag, nine times out of ten
          (an open PO just means more deliveries might follow). It's
          the "Purchase order" field below now, same as record number
          and recorded-at moved out of the header into this grid
          rather than sitting in their own corner. A real delivery
          note doesn't call out routine metadata with a warning
          colour; only the discrepancy banner above earns that. */}
      <div className="pdf-meta-grid">
        <div>
          <p className="pdf-meta-label">Record number</p>
          <p className="pdf-meta-value">#{String(delivery.id).padStart(4, '0')}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Recorded</p>
          <p className="pdf-meta-value">{formatDateTime(delivery.created_at)}</p>
        </div>
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
            {' · '}{isClosed ? 'Closed off' : 'Still open'}
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
                      {v ? v.label : '0'}
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
        {/* A tfoot row in the table's own columns, not a separate block
            below it — the old .pdf-totals-row was a flex row right-
            aligned to the page margin, which put "Total ordered"/
            "Total received" under the Unit/Variance columns instead of
            Ordered/Received. Summing a column only means something if
            the sum sits in that column. */}
        {items.length > 0 && (
          <tfoot>
            <tr className="pdf-table-foot">
              <td colSpan={2} className="pdf-table-foot-label">Total</td>
              <td className="pdf-table-center pdf-table-foot-value">{fmtQty(totalExpected)}</td>
              {!fromPO && (
                <td className="pdf-table-center pdf-table-foot-value">{fmtQty(totalReceived)}</td>
              )}
              <td colSpan={fromPO ? 1 : 2} />
            </tr>
          </tfoot>
        )}
      </table>

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
            {delivery.driver_name || 'Not recorded'} · {formatDate(delivery.delivery_date)}
          </p>
        </div>
        <div className="pdf-signature-block">
          {/* No line here on purpose: the warehouse side has no
              signature to collect, only who was signed in when the
              delivery was recorded — a blank "sign here" rule under
              a label nobody was ever going to sign read as an
              unfinished document, not an intentionally empty one. */}
          <p className="pdf-signature-label">Received by (warehouse)</p>
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
