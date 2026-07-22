import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const DeliveryNotePDF = ({ delivery, onClose }) => {
  const documentRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  if (!delivery) return null;

  const isCompleted = delivery.po_status === 'completed';

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

      // bloburl opens in the browser's built-in PDF viewer —
      // no forced download; the viewer can still save/print if needed.
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

          {/* Document header */}
          <div className="pdf-doc-header">
            <div>
              <h1 className="pdf-doc-title">DELIVERY NOTE</h1>
              <p className="pdf-doc-subtitle">LADLES OF LOVE · NOURISH OUR CHILDREN PROGRAMME</p>
              <p className="pdf-doc-subtitle">WAREHOUSE MANAGEMENT SYSTEM</p>
            </div>
            <div>
              <p className="pdf-doc-id-label">RECORD NUMBER</p>
              <p className="pdf-doc-id">#{String(delivery.id).padStart(4, '0')}</p>
              <p className="pdf-doc-id-label pdf-doc-id-label--spaced">
                DATE RECORDED: {formatDate(delivery.created_at)}
              </p>
            </div>
          </div>

          {/* PO completion status banner */}
          <div className={`pdf-status-banner ${isCompleted ? 'pdf-status-banner--complete' : 'pdf-status-banner--pending'}`}>
            <div>
              {isCompleted ? (
                <>
                  <p className="pdf-status-title pdf-status-title--complete">
                    Purchase Order #{delivery.po_id} — Marked as Complete
                  </p>
                  <p className="pdf-status-body pdf-status-body--complete">
                    All items from this purchase order have been fully delivered and the order is now closed.
                  </p>
                </>
              ) : (
                <>
                  <p className="pdf-status-title pdf-status-title--pending">
                    Purchase Order #{delivery.po_id} — Awaiting Further Delivery
                  </p>
                  <p className="pdf-status-body pdf-status-body--pending">
                    This is delivery <strong>#{delivery.id}</strong>. The purchase order has not been marked
                    as complete and may have future deliveries recorded against it.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Meta info grid */}
          <div className="pdf-meta-grid">
            <div>
              <p className="pdf-meta-label">Supplier</p>
              <p className="pdf-meta-value">{delivery.supplier_name || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Driver</p>
              <p className="pdf-meta-value">{delivery.driver_name || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Driver ID / Licence</p>
              <p className="pdf-meta-value">{delivery.driver_id_number || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Delivery Date</p>
              <p className="pdf-meta-value">{formatDate(delivery.delivery_date)}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Received By</p>
              <p className="pdf-meta-value">{delivery.received_by_name || '—'}</p>
            </div>
            <div>
              <p className="pdf-meta-label">Purchase Order</p>
              <p className="pdf-meta-value">
                PO #{delivery.po_id || delivery.purchase_order_id || '—'}
              </p>
            </div>
          </div>

          {/* Items table */}
          <p className="pdf-items-title">ITEMS RECEIVED</p>
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="pdf-table-center">Expected Qty</th>
                <th className="pdf-table-center">Expected Weight (kg)</th>
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
              <p className="pdf-signature-label">Driver Signature</p>
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
              <p className="pdf-signature-label">Received By (Warehouse)</p>
              <div className="pdf-signature-line" />
              <p className="pdf-signature-name">
                {delivery.received_by_name || 'Warehouse Worker'} · {formatDate(delivery.delivery_date)}
              </p>
            </div>
          </div>

          {/* Footer stamp */}
          <div className="pdf-footer-stamp">
            <p>LADLES OF LOVE NGO · WAREHOUSE MANAGEMENT SYSTEM</p>
            <p className="pdf-footer-stamp--spaced">
              DOCUMENT GENERATED: {new Date().toLocaleString('en-ZA')} · RECORD #{delivery.id}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DeliveryNotePDF;