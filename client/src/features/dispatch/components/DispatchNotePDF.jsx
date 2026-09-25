import usePdfDocument from '../../staff/hooks/usePdfDocument';
import '../../../styles/deliveryNotePDF.css';
import { fmtQty } from '../../../lib/quantity';

// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/DispatchNotePDF.jsx
//
// The dispatch equivalent of DeliveryNotePDF.jsx / DecantingSheetPDF.jsx
// — same document shell (.pdfnote-* classes, deliveryNotePDF.css), same
// html2canvas+jsPDF pipeline (usePdfDocument). Where a delivery note
// records goods coming IN from a supplier, this records goods going
// OUT to a beneficiary centre: the "To" party is the centre, not a supplier,
// and the two closing blocks are the driver who collected (signs, the
// external party) and the warehouse staff member who ran the gate
// check (named, no signature — the record already knows who was
// signed in, same reasoning DeliveryNotePDF's "Received by" uses).
//
// Fed by whatever GET /api/dispatch/notes/:eventId returns — see
// server/src/repositories/dispatch.repository.js's getDispatchNote,
// which both the auto-pop-up (PalletCheck.jsx) and the staff dispatch
// history page call.
// ─────────────────────────────────────────────────────────────

const PDF_LOGO_URL = '/images/pdf_logo.png';

// Same warehouse block DeliveryNotePDF.jsx / DecantingSheetPDF.jsx use.
const WAREHOUSE = {
  name: 'Ladles of Love, Cape Town Warehouse',
  addressLines: ['Unit 4, Hewett Park', '17 Hewett Ave, Epping', 'Cape Town, 7460'],
  phone: '',
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const DispatchNotePDF = ({ note, onClose }) => {
  const { documentRef, isGenerating, error: genError, openPdf: handleViewPdf } = usePdfDocument();

  if (!note) return null;

  const isLate = note.status === 'late_collected';
  const lines = note.lines || [];

  const additionalInfo = note.override_reason
    ? `This collection needed a manager's authorisation: ${note.override_reason}`
    : isLate
      ? 'This pallet was written off at the 15:00 cut-off before the driver arrived. It was collected after that, and recorded as a late collection: the goods left the building normally.'
      : 'This pallet was collected on time and in full, matched against what packing recorded.';

  return (
    <div className="pdfnote-modal">

      {/* Toolbar */}
      <div className="pdfnote-toolbar">
        <span className="pdfnote-toolbar-title">
          DISPATCH NOTE #{note.id} - {note.ecd_name}
        </span>
        <div className="pdfnote-toolbar-actions">
          {genError && <span className="pdfnote-toolbar-error">{genError}</span>}
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
      <div className="pdfnote-scroll-area">
        <div className="pdfnote-document" ref={documentRef}>

          <div className="pdfnote-doc-header">
            <div>
              <div className="pdfnote-doc-title-tick" />
              <h1 className="pdfnote-doc-title">Dispatch Note</h1>
            </div>
            <img src={PDF_LOGO_URL} alt="" className="pdfnote-doc-logo" aria-hidden="true" />
          </div>
          <div className="pdfnote-doc-rule" />

          <div className="pdfnote-doc-parties">
            <div className="pdfnote-doc-party-col">
              <div className="pdfnote-doc-party">
                <p className="pdfnote-doc-party-heading">{WAREHOUSE.name}</p>
                {WAREHOUSE.addressLines.map((line) => (
                  <p key={line} className="pdfnote-doc-party-line">{line}</p>
                ))}
                {WAREHOUSE.phone ? <p className="pdfnote-doc-party-line">{WAREHOUSE.phone}</p> : null}
              </div>
              <div className="pdfnote-doc-party">
                <p className="pdfnote-doc-party-heading">To</p>
                <p className="pdfnote-doc-party-line pdfnote-doc-party-line--primary">
                  {note.ecd_name || '—'}
                </p>
                {note.contact_name ? (
                  <p className="pdfnote-doc-party-line">Contact: {note.contact_name}</p>
                ) : null}
                {note.child_count ? (
                  <p className="pdfnote-doc-party-line">{note.child_count} children served</p>
                ) : null}
              </div>
            </div>

            <div className="pdfnote-doc-meta-box">
              <p className="pdfnote-doc-meta-line">
                <span>Dispatch note no.</span>
                <strong>#{String(note.id).padStart(4, '0')}</strong>
              </p>
              <p className="pdfnote-doc-meta-line">
                <span>Collected</span>
                <strong>{formatDate(note.collected_at)}</strong>
              </p>
              <p className="pdfnote-doc-meta-line">
                <span>Pallet ref</span>
                <strong>{note.pallet_ref || '—'}</strong>
              </p>
              <p className="pdfnote-doc-meta-line">
                <span>Cohort</span>
                <strong>{note.cohort || '—'}</strong>
              </p>
              <p className="pdfnote-doc-meta-line">
                <span>Status</span>
                <strong className={isLate ? 'pdfnote-status-partial' : 'pdfnote-status-complete'}>
                  {isLate ? 'Collected (late)' : 'Collected'}
                </strong>
              </p>
            </div>
          </div>

          <div className="pdfnote-doc-additional">
            <p className="pdfnote-doc-section-heading">Additional information</p>
            <p className="pdfnote-doc-additional-text">{additionalInfo}</p>
          </div>

          <table className="pdfnote-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>SKU</th>
                <th className="pdfnote-table-center">Packed</th>
                <th className="pdfnote-table-center">Loaded</th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((line, i) => (
                  <tr key={line.id ?? i}>
                    <td className="pdfnote-table-product">{line.product_name || '—'}</td>
                    <td className="pdfnote-table-sku">{line.sku || '—'}</td>
                    <td className="pdfnote-table-center">
                      {fmtQty(line.packed_quantity, line.unit)}
                    </td>
                    <td className="pdfnote-table-center">
                      {fmtQty(line.loaded_quantity, line.unit)}
                      {Number(line.loaded_quantity) !== Number(line.packed_quantity) ? ' *' : ''}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="pdfnote-table-empty">
                    No items on record
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Signature section */}
          <div className="pdfnote-signature-section">
            <div className="pdfnote-signature-block">
              <p className="pdfnote-signature-label">Driver&rsquo;s signature</p>
              {note.signature ? (
                <img src={note.signature} alt="Driver signature" className="pdfnote-signature-img" />
              ) : (
                <div className="pdfnote-signature-line" />
              )}
              <p className="pdfnote-signature-name">
                {note.driver_name || 'Driver'}{note.vehicle_reg ? ` · ${note.vehicle_reg}` : ''}
              </p>
            </div>
            <div className="pdfnote-signature-block">
              {/* No signature line here, same reasoning DeliveryNotePDF's
                  "Received by" uses — this is the warehouse's own
                  staff member, already known from the signed-in
                  session, not a second physical signature to collect. */}
              <p className="pdfnote-signature-label">Dispatched by</p>
              <p className="pdfnote-signature-name pdfnote-signature-name--standalone">
                {note.dispatched_by_name || 'Warehouse Worker'} · {formatDate(note.collected_at)}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DispatchNotePDF;
