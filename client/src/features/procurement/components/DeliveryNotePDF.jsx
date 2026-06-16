import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/DeliveryNotePDF.jsx
// ─────────────────────────────────────────────────────────────

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const DeliveryNotePDF = ({ delivery, onClose }) => {
  const documentRef  = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!delivery) return null;

  const isCompleted = delivery.po_status === 'completed';

  // ── Generate and download PDF ─────────────────────────────
  const handleDownload = async () => {
    if (!documentRef.current) return;
    setIsGenerating(true);
    try {
      const canvas    = await html2canvas(documentRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#FFFFFF', logging: false,
      });
      const imgData   = canvas.toDataURL('image/png');
      const pdf       = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight= pdf.internal.pageSize.getHeight();
      const imgWidth  = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let yPos = 0;
      while (yPos < imgHeight) {
        if (yPos > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yPos, imgWidth, imgHeight);
        yPos += pageHeight;
      }
      pdf.save(`DeliveryNote_${delivery.id}_${delivery.supplier_name?.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="btn-primary"
            style={{ height: '28px', fontSize: '8px' }}
          >
            {isGenerating ? 'GENERATING...' : '↓ DOWNLOAD PDF'}
          </button>
          <button onClick={onClose} className="btn-ghost">✕ CLOSE</button>
        </div>
      </div>

      {/* Scrollable document */}
      <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
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
              <p className="pdf-doc-id-label" style={{ marginTop: '4px' }}>
                DATE RECORDED: {formatDate(delivery.created_at)}
              </p>
            </div>
          </div>

          {/* ── PO Completion status banner ──────────────────── */}
          <div style={{
            padding: '10px 14px',
            marginBottom: '14px',
            border: `1px solid ${isCompleted ? '#107C10' : '#BA7517'}`,
            background: isCompleted ? '#DFF6DD' : '#FAEEDA',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}>
          
            <div>
              {isCompleted ? (
                <>
                  <p style={{ fontSize: '13px', fontWeight: 900, color: '#107C10', margin: '0 0 2px', textTransform: 'uppercase' }}>
                    Purchase Order #{delivery.po_id} — Marked as Complete
                  </p>
                  <p style={{ fontSize: '11px', color: '#27500A', margin: 0 }}>
                    All items from this purchase order have been fully delivered and the order is now closed.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '13px', fontWeight: 900, color: '#633806', margin: '0 0 2px', textTransform: 'uppercase' }}>
                    Purchase Order #{delivery.po_id} — Awaiting Further Delivery
                  </p>
                  <p style={{ fontSize: '11px', color: '#633806', margin: 0 }}>
                    This is delivery{' '}
                    <strong>#{delivery.id}</strong>.
                    The purchase order has not been marked as complete and may have future deliveries recorded against it.
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
                <th style={{ textAlign: 'center' }}>Expected Qty</th>
                <th style={{ textAlign: 'center' }}>Expected Weight (kg)</th>
              </tr>
            </thead>
            <tbody>
              {delivery.items?.length ? (
                delivery.items.map((item, i) => (
                  <tr key={item.purchase_order_item_id ?? i}>
                    <td style={{ fontWeight: 700 }}>{item.product_name}</td>
                    <td style={{ color: '#605E5C' }}>{item.sku || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{item.expected_quantity}</td>
                    <td style={{ textAlign: 'center' }}>
                      {item.expected_weight_kg ? `${item.expected_weight_kg} kg` : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#A19F9D', padding: '16px' }}>
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
                <img
                  src={delivery.signature}
                  alt="Driver signature"
                  className="pdf-signature-img"
                />
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
            <p style={{ marginTop: '2px' }}>
              DOCUMENT GENERATED: {new Date().toLocaleString('en-ZA')} · RECORD #{delivery.id}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DeliveryNotePDF;