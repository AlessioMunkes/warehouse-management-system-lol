import usePdfDocument from '../../staff/hooks/usePdfDocument';
import '../../../styles/deliveryNotePDF.css';

// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/components/DecantingSheetPDF.jsx
//
// The decanting equivalent of DeliveryNotePDF.jsx — same document
// shell (.pdf-* classes, deliveryNotePDF.css), same html2canvas+jsPDF
// pipeline (usePdfDocument), adapted to what a decanting record
// actually has instead of a delivery: no supplier, no signature (this
// is an internal record with no external party to sign it), one or
// more product lines instead of purchase-order lines, and a bag
// breakdown instead of a weight column.
//
// Fed by whatever recordDecanting/getDecantingById returns — see
// server/src/repositories/decanting.repository.js's getDecantingById,
// which both already call, so the shape here matches that query's
// columns exactly rather than a route-specific one.
// ─────────────────────────────────────────────────────────────

const PDF_LOGO_URL = '/images/pdf_logo.png';

// Same warehouse block DeliveryNotePDF.jsx uses — see that file's own
// comment for why this is hardcoded rather than looked up.
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

// "500g" and "2kg" sort largest-first, the same order DecantingFlow's
// own bag-list screen uses — a sheet that lists 500 g bags before 2 kg
// ones reads backwards to someone used to the screen it came from.
const bagKg = (label) => (label.endsWith('kg') ? parseFloat(label) : parseFloat(label) / 1000);
const bagLabelsOf = (bags) => Object.keys(bags || {}).sort((a, b) => bagKg(b) - bagKg(a));
const bagSummaryOf = (bags) =>
  bagLabelsOf(bags).map((label) => `${bags[label]} × ${label}`).join(', ') || '—';

// 5%, same threshold DecantingFlow's own count-back screen warns at —
// one number in one place would be worse than this repeating it, but
// two different thresholds for the same fact would be worse still.
const WASTAGE_WARN_RATIO = 0.05;

const DecantingSheetPDF = ({ record, onClose }) => {
  const { documentRef, isGenerating, error: genError, openPdf: handleViewPdf } = usePdfDocument();

  if (!record) return null;

  const lines = record.lines || [];
  const flaggedWastage = lines.some((line) =>
    Number(line.actual_bulk_kg) > 0 &&
    Number(line.wastage_kg || 0) > Number(line.actual_bulk_kg) * WASTAGE_WARN_RATIO
  );
  const marginExceeded = lines.some((line) => line.within_margin === false);

  const status = flaggedWastage
    ? { label: 'Wastage flagged', className: 'pdf-status-partial' }
    : marginExceeded
      ? { label: 'Margin exceeded', className: 'pdf-status-partial' }
      : { label: 'Within margin', className: 'pdf-status-complete' };

  const additionalInfo = flaggedWastage
    ? 'One or more lines lost more than usual to spillage or spoilage. A manager will review the wastage recorded below.'
    : marginExceeded
      ? 'One or more lines fell outside the usual bagging margin. A manager will review the split recorded below.'
      : 'Every line on this sheet packed within the usual bagging margin, with no unusual wastage recorded.';

  return (
    <div className="pdf-modal">

      {/* Toolbar */}
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-title">
          DECANTING SHEET #{record.id} — Week of {formatDate(record.week_of)}
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
              <h1 className="pdf-doc-title">Decanting Sheet</h1>
            </div>
            <img src={PDF_LOGO_URL} alt="" className="pdf-doc-logo" aria-hidden="true" />
          </div>
          <div className="pdf-doc-rule" />

          {/* No second party column — a decanting sheet has no
              external supplier or driver, just the warehouse and the
              record's own identifying details, so the meta box is the
              only thing on the right. */}
          <div className="pdf-doc-parties">
            <div className="pdf-doc-party-col">
              <div className="pdf-doc-party">
                <p className="pdf-doc-party-heading">{WAREHOUSE.name}</p>
                {WAREHOUSE.addressLines.map((line) => (
                  <p key={line} className="pdf-doc-party-line">{line}</p>
                ))}
                {WAREHOUSE.phone ? <p className="pdf-doc-party-line">{WAREHOUSE.phone}</p> : null}
              </div>
            </div>

            <div className="pdf-doc-meta-box">
              <p className="pdf-doc-meta-line">
                <span>Sheet no.</span>
                <strong>#{String(record.id).padStart(4, '0')}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Week of</span>
                <strong>{formatDate(record.week_of)}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Recorded</span>
                <strong>{formatDate(record.created_at)}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Recorded by</span>
                <strong>{record.recorded_by_name || 'Warehouse Worker'}</strong>
              </p>
              <p className="pdf-doc-meta-line">
                <span>Status</span>
                <strong className={status.className}>{status.label}</strong>
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
                <th>Product</th>
                <th className="pdf-table-center">Weighed</th>
                <th className="pdf-table-center">Packed</th>
                <th>Bags</th>
                <th className="pdf-table-center">Wastage</th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((line, i) => (
                  <tr key={line.id ?? i}>
                    <td className="pdf-table-product">{line.product_name || '—'}</td>
                    <td className="pdf-table-center">
                      {line.actual_bulk_kg != null ? `${line.actual_bulk_kg} kg` : '—'}
                    </td>
                    <td className="pdf-table-center">
                      {line.packed_kg != null ? `${line.packed_kg} kg` : '—'}
                    </td>
                    <td className="pdf-table-sku">{bagSummaryOf(line.bags)}</td>
                    <td className="pdf-table-center">
                      {Number(line.wastage_kg || 0) > 0 ? `${line.wastage_kg} kg` : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="pdf-table-empty">
                    No lines on record
                  </td>
                </tr>
              )}
            </tbody>
          </table>

        </div>
      </div>
    </div>
  );
};

export default DecantingSheetPDF;
