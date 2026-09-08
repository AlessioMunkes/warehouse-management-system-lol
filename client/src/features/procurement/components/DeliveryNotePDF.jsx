import usePdfDocument from '../../staff/hooks/usePdfDocument';
import '../../../styles/deliveryNotePDF.css';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/DeliveryNotePDF.jsx
//
// Renders a saved delivery record as a formatted note. The
// toolbar action opens the generated PDF in a new browser tab
// (view-only) rather than forcing a file download, so managers
// reviewing a delivery can glance at it without a file landing
// in their downloads folder. The browser's own PDF viewer still
// lets them save/print from there if they choose to.
// ─────────────────────────────────────────────────────────────

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

  return (
    <div className="pdf-modal">

      {/* Toolbar */}
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-title">
          DELIVERY NOTE #{delivery.id} — {delivery.supplier_name}
        </span>
        <div className="pdf-toolbar-actions">
          {genError && <span className="pdf-toolbar-error">{genError}</span>}
          <button
            onClick={handleViewPdf}
            disabled={isGenerating}
            className="btn-primary btn-sm"
          >
            {isGenerating ? 'GENERATING...' : '⤢ VIEW PDF'}
          </button>
          <button onClick={onClose} className="btn-ghost">✕ CLOSE</button>
        </div>
      </div>

      {/* Scrollable document */}
      <div className="pdf-scroll-area">
        <div className="pdf-document" ref={documentRef}>

          {/* Document header — title top-left, logo top-right, an
              accent rule below, matching the reference template's
              layout (adapted to our own brand colour, not its teal). */}
          <div className="pdf-doc-header">
            <div>
              <div className="pdf-doc-title-tick" />
              <h1 className="pdf-doc-title">Delivery Note</h1>
            </div>
            <img src={PDF_LOGO_URL} alt="" className="pdf-doc-logo" aria-hidden="true" />
          </div>
          <div className="pdf-doc-rule" />

          {/* Two columns: who issued this note and who it's from,
              stacked on the left; the note's own identifying details
              in a box on the right — same placement as the reference. */}
          <div className="pdf-doc-parties">
            <div className="pdf-doc-party-col">
              <div className="pdf-doc-party">
                <p className="pdf-doc-party-heading">{WAREHOUSE.name}</p>
                {WAREHOUSE.addressLines.map((line) => (
                  <p key={line} className="pdf-doc-party-line">{line}</p>
                ))}
                {WAREHOUSE.phone ? <p className="pdf-doc-party-line">{WAREHOUSE.phone}</p> : null}
              </div>
              <div className="pdf-doc-party">
                <p className="pdf-doc-party-heading">From</p>
                <p className="pdf-doc-party-line pdf-doc-party-line--primary">
                  {delivery.supplier_name || '—'}
                </p>
                <p className="pdf-doc-party-line">
                  {delivery.supplier_address || DUMMY_SUPPLIER_ADDRESS}
                </p>
                <p className="pdf-doc-party-line">
                  {delivery.supplier_phone || DUMMY_SUPPLIER_PHONE}
                </p>
              </div>
            </div>

            <div className="pdf-doc-meta-box">
              <p className="pdf-doc-meta-line">
                <span>Delivery note no.</span>
                <strong>#{String(delivery.id).padStart(4, '0')}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Date</span>
                <strong>{formatDate(delivery.delivery_date)}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Location</span>
                <strong>Cape Town Warehouse</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Purchase order</span>
                <strong>#{delivery.po_id || delivery.purchase_order_id || '—'}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Status</span>
                <strong className={isCompleted ? 'pdf-status-complete' : 'pdf-status-partial'}>
                  {isCompleted ? 'Completed' : 'Partially delivered'}
                </strong>
              </p>
            </div>
          </div>

          <div className="pdf-doc-additional">
            <p className="pdf-doc-section-heading">Additional information</p>
            <p className="pdf-doc-additional-text">{additionalInfo}</p>
          </div>

          {/* Items table */}
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>SKU</th>
                <th className="pdf-table-center">Expected qty</th>
                <th className="pdf-table-center">Weight</th>
              </tr>
            </thead>
            <tbody>
              {delivery.items?.length ? (
                delivery.items.map((item, i) => (
                  <tr key={item.purchase_order_item_id ?? i}>
                    <td className="pdf-table-product">{item.product_name}</td>
                    <td className="pdf-table-sku">{item.sku || '—'}</td>
                    <td className="pdf-table-center">{item.expected_quantity}</td>
                    <td className="pdf-table-center">
                      {item.expected_weight_kg ? `${item.expected_weight_kg} kg` : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="pdf-table-empty">
                    No items on record
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Signature section */}
          <div className="pdf-signature-section">
            <div className="pdf-signature-block">
              <p className="pdf-signature-label">Driver&rsquo;s signature</p>
              {delivery.signature ? (
                <img src={delivery.signature} alt="Driver signature" className="pdf-signature-img" />
              ) : (
                <div className="pdf-signature-line" />
              )}
            </div>
            <div className="pdf-signature-block">
              {/* No signature line here — this isn't a second physical
                  signature to collect. The record already knows who
                  was signed in when it was submitted, so it just says
                  so, the way the meta block above already does. */}
              <p className="pdf-signature-label">Received by</p>
              <p className="pdf-signature-name pdf-signature-name--standalone">
                {delivery.received_by_name || 'Warehouse Worker'} · {formatDate(delivery.delivery_date)}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DeliveryNotePDF;