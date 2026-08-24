import { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/DispatchNotePDF.jsx
//
// Renders a dispatch event (GET /api/dispatch/notes/:eventId) as a
// formatted proof-of-collection note. Modeled directly on
// DeliveryNotePDF.jsx — same html2canvas -> jsPDF -> open-in-new-tab
// approach and the same `pdf-*` classes, so the two documents read as
// one family. The toolbar opens the PDF in a new tab (view-only)
// rather than forcing a download, so a driver waiting at the gate
// does not need anything to land in a downloads folder to see it.
// ─────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  collected:      'Collected',
  late_collected: 'Collected (late)',
  not_collected:  'Not collected',
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const formatDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const DispatchNotePDF = ({ note, onClose }) => {
  const documentRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  if (!note) return null;

  const isLate = note.status === 'late_collected';

  // ── Generate PDF and open it in a new tab ─────────────────
  const handleViewPdf = async () => {
    if (!documentRef.current) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const canvas = await html2canvas(documentRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#FFFFFF', logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let yPos = 0;
      while (yPos < imgHeight) {
        if (yPos > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yPos, imgWidth, imgHeight);
        yPos += pageHeight;
      }

      // bloburl opens in the browser's built-in PDF viewer — no
      // forced download; the viewer can still save/print if needed.
      const blobUrl = pdf.output('bloburl');
      const opened = window.open(blobUrl, '_blank');
      if (!opened) {
        setGenError('Pop-up blocked — allow pop-ups for this site to view the PDF.');
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      setGenError('Could not generate the PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

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

          {/* Document header */}
          <div className="pdf-doc-header">
            <div>
              <h1 className="pdf-doc-title">DISPATCH NOTE</h1>
              <p className="pdf-doc-subtitle">LADLES OF LOVE · NOURISH OUR CHILDREN PROGRAMME</p>
              <p className="pdf-doc-subtitle">WAREHOUSE MANAGEMENT SYSTEM</p>
            </div>
            <div>
              <p className="pdf-doc-id-label">RECORD NUMBER</p>
              <p className="pdf-doc-id">#{String(note.id).padStart(4, '0')}</p>
              <p className="pdf-doc-id-label pdf-doc-id-label--spaced">
                COLLECTED: {formatDateTime(note.collected_at)}
              </p>
            </div>
          </div>

          {/* Collection status banner */}
          <div className={`pdf-status-banner ${isLate ? 'pdf-status-banner--pending' : 'pdf-status-banner--complete'}`}>
            <div>
              <p className={`pdf-status-title ${isLate ? 'pdf-status-title--pending' : 'pdf-status-title--complete'}`}>
                {note.pallet_ref ? `Pallet ${note.pallet_ref} — ` : ''}{STATUS_LABEL[note.status] || note.status}
              </p>
              <p className={`pdf-status-body ${isLate ? 'pdf-status-body--pending' : 'pdf-status-body--complete'}`}>
                {isLate
                  ? 'This pallet was collected after the standard cut-off and recorded as a late collection.'
                  : 'This pallet was checked, signed for, and released to the collector below.'}
              </p>
              {note.override_reason ? (
                <p className="pdf-status-body">
                  Authorised by {note.override_by_name || 'a manager'}: {note.override_reason}
                </p>
              ) : null}
            </div>
          </div>

          {/* Meta info grid */}
          <div className="pdf-meta-grid">
            <div>
              <p className="pdf-meta-label">Centre (ECD)</p>
              <p className="pdf-meta-value">{note.ecd_name || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Contact</p>
              <p className="pdf-meta-value">{note.contact_name || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Children</p>
              <p className="pdf-meta-value">{note.child_count ?? '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Dispatch Date</p>
              <p className="pdf-meta-value">{formatDate(note.dispatch_date)}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Cohort</p>
              <p className="pdf-meta-value">{note.cohort || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Pallet Ref</p>
              <p className="pdf-meta-value">{note.pallet_ref || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Driver / Collector</p>
              <p className="pdf-meta-value">{note.driver_name || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Vehicle Reg</p>
              <p className="pdf-meta-value">{note.vehicle_reg || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Dispatched By</p>
              <p className="pdf-meta-value">{note.dispatched_by_name || '—'}</p>
            </div>
          </div>

          {/* Items table */}
          <p className="pdf-items-title">ITEMS LOADED</p>
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="pdf-table-center">Slip Qty</th>
                <th className="pdf-table-center">Loaded Qty</th>
                <th>Variance Reason</th>
              </tr>
            </thead>
            <tbody>
              {note.lines?.length ? (
                note.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="pdf-table-product">{line.product_name}</td>
                    <td className="pdf-table-sku">{line.sku || '—'}</td>
                    <td className="pdf-table-center">
                      {line.packed_quantity ?? '—'} {line.unit}
                    </td>
                    <td className="pdf-table-center">
                      {line.loaded_quantity ?? '—'} {line.unit}
                    </td>
                    <td>{line.variance_reason || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="pdf-table-empty">
                    No items on record
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Signature section */}
          <div className="pdf-signature-section">
            <div className="pdf-signature-block">
              <p className="pdf-signature-label">Driver / Collector Signature</p>
              {note.signature ? (
                <img src={note.signature} alt="Driver signature" className="pdf-signature-img" />
              ) : (
                <div className="pdf-signature-line" />
              )}
              <p className="pdf-signature-name">
                {note.driver_name || '—'} · {formatDateTime(note.collected_at)}
              </p>
            </div>
            <div className="pdf-signature-block">
              <p className="pdf-signature-label">Dispatched By (Warehouse)</p>
              <div className="pdf-signature-line" />
              <p className="pdf-signature-name">
                {note.dispatched_by_name || 'Warehouse Worker'} · {formatDateTime(note.collected_at)}
              </p>
            </div>
          </div>

          {/* Footer stamp */}
          <div className="pdf-footer-stamp">
            <p>LADLES OF LOVE NGO · WAREHOUSE MANAGEMENT SYSTEM</p>
            <p className="pdf-footer-stamp--spaced">
              DOCUMENT GENERATED: {new Date().toLocaleString('en-ZA')} · RECORD #{note.id}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DispatchNotePDF;
