import usePdfDocument from '../../staff/hooks/usePdfDocument';
import '../../../styles/deliveryNotePDF.css';

// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/DispatchNotePDF.jsx
//
// The dispatch equivalent of DeliveryNotePDF.jsx / DecantingSheetPDF.jsx
// — same document shell (.pdf-* classes, deliveryNotePDF.css), same
// html2canvas+jsPDF pipeline (usePdfDocument). Where a delivery note
// records goods coming IN from a supplier, this records goods going
// OUT to an ECD centre: the "To" party is the centre, not a supplier,
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
  name: 'Ladles of Love — Cape Town Warehouse',
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
      ? 'This pallet was written off at the 16:00 cut-off before the driver arrived. It was collected after that, and recorded as a late collection — the goods left the building normally.'
      : 'This pallet was collected on time and in full, matched against what packing recorded.';

  return (
    <div className="pdf-modal">

      {/* Toolbar */}
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-title">
          DISPATCH NOTE #{note.id} — {note.ecd_name}
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

          <div className="pdf-doc-header">
            <div>
              <div className="pdf-doc-title-tick" />
              <h1 className="pdf-doc-title">Dispatch Note</h1>
            </div>
            <img src={PDF_LOGO_URL} alt="" className="pdf-doc-logo" aria-hidden="true" />
          </div>
          <div className="pdf-doc-rule" />

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
                <p className="pdf-doc-party-heading">To</p>
                <p className="pdf-doc-party-line pdf-doc-party-line--primary">
                  {note.ecd_name || '—'}
                </p>
                {note.contact_name ? (
                  <p className="pdf-doc-party-line">Contact: {note.contact_name}</p>
                ) : null}
                {note.child_count ? (
                  <p className="pdf-doc-party-line">{note.child_count} children served</p>
                ) : null}
              </div>
            </div>

            <div className="pdf-doc-meta-box">
              <p className="pdf-doc-meta-line">
                <span>Dispatch note no.</span>
                <strong>#{String(note.id).padStart(4, '0')}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Collected</span>
                <strong>{formatDate(note.collected_at)}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Pallet ref</span>
                <strong>{note.pallet_ref || '—'}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Cohort</span>
                <strong>{note.cohort || '—'}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Status</span>
                <strong className={isLate ? 'pdf-status-partial' : 'pdf-status-complete'}>
                  {isLate ? 'Collected (late)' : 'Collected'}
                </strong>
              </p>
            </div>
          </div>

          <div className="pdf-doc-additional">
            <p className="pdf-doc-section-heading">Additional information</p>
            <p className="pdf-doc-additional-text">{additionalInfo}</p>
          </div>

          <table className="pdf-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>SKU</th>
                <th className="pdf-table-center">Packed</th>
                <th className="pdf-table-center">Loaded</th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((line, i) => (
                  <tr key={line.id ?? i}>
                    <td className="pdf-table-product">{line.product_name || '—'}</td>
                    <td className="pdf-table-sku">{line.sku || '—'}</td>
                    <td className="pdf-table-center">
                      {line.packed_quantity} {line.unit}
                    </td>
                    <td className="pdf-table-center">
                      {line.loaded_quantity} {line.unit}
                      {Number(line.loaded_quantity) !== Number(line.packed_quantity) ? ' *' : ''}
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
              {note.signature ? (
                <img src={note.signature} alt="Driver signature" className="pdf-signature-img" />
              ) : (
                <div className="pdf-signature-line" />
              )}
              <p className="pdf-signature-name">
                {note.driver_name || 'Driver'}{note.vehicle_reg ? ` · ${note.vehicle_reg}` : ''}
              </p>
            </div>
            <div className="pdf-signature-block">
              {/* No signature line here, same reasoning DeliveryNotePDF's
                  "Received by" uses — this is the warehouse's own
                  staff member, already known from the signed-in
                  session, not a second physical signature to collect. */}
              <p className="pdf-signature-label">Dispatched by</p>
              <p className="pdf-signature-name pdf-signature-name--standalone">
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
