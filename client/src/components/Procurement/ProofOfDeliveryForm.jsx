import React, { useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { apiGet } from '../../services/api';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/ProofOfDeliveryForm.jsx
//
// Workflow:
//   Step 1 — Select supplier, driver, delivery date
//   Step 2 — Select approved purchase order
//   Step 3 — View expected items (auto-populated from PO)
//   Step 4 — Driver signs the digital signature pad
//
// Signature is saved as a base64 PNG string and sent with
// the form submission to be stored on the delivery note.
// No inline styles — all classes from src/css/index.css
// ─────────────────────────────────────────────────────────────

const ProofOfDeliveryForm = ({
  onSubmit,
  onCancel,
  isSubmitting = false,
  suppliers    = [],
  drivers      = [],
}) => {
  const [supplierId,   setSupplierId]   = useState('');
  const [driverId,     setDriverId]     = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [lineItems,    setLineItems]    = useState([]);
  const [signatureData, setSignatureData] = useState('');

  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [purchaseOrders,  setPurchaseOrders]  = useState([]);
  const [errors,          setErrors]          = useState({});
  const [loadingPOs,      setLoadingPOs]      = useState(false);
  const [loadingItems,    setLoadingItems]    = useState(false);
  const [poError,         setPoError]         = useState('');
  const [isSigned,        setIsSigned]        = useState(false);

  const [poCompleted, setPoCompleted] = useState(false);

  const sigCanvasRef = useRef(null);

  // ── When supplier changes: filter drivers, fetch POs ─────────
  useEffect(() => {
    setDriverId('');
    setSelectedPoId('');
    setLineItems([]);
    setPurchaseOrders([]);
    setPoError('');

    if (!supplierId) {
      setFilteredDrivers([]);
      return;
    }

    setFilteredDrivers(
      drivers.filter((d) => d.supplier_id === parseInt(supplierId))
    );

    const fetchPOs = async () => {
      setLoadingPOs(true);
      setPoError('');
      try {
        const res = await apiGet(`/api/deliveries/purchase-orders?supplierId=${supplierId}`);
        setPurchaseOrders(res.data);
        if (res.data.length === 0)
          setPoError('No approved purchase orders found for this supplier.');
      } catch {
        setPoError('Failed to load purchase orders.');
      } finally {
        setLoadingPOs(false);
      }
    };

    fetchPOs();
  }, [supplierId, drivers]);

  // ── When PO is selected: fetch and auto-populate items ───────
  const handlePoSelect = async (poId) => {
    setSelectedPoId(poId);
    setLineItems([]);
    setLoadingItems(true);
    try {
      const res = await apiGet(`/api/deliveries/purchase-orders/${poId}/items`);
      setLineItems(
        res.data.map((item) => ({
          purchaseOrderItemId: item.purchase_order_item_id,
          productId:           item.product_id,
          productName:         item.product_name,
          expectedQuantity:    item.expected_quantity,
          expectedWeightKg:    item.expected_weight_kg || '—',
          sku:                 item.sku || '',
        }))
      );
    } catch {
      setPoError('Failed to load purchase order items.');
    } finally {
      setLoadingItems(false);
    }
  };

  // ── Signature handlers ────────────────────────────────────────
const handleSignatureEnd = () => {
  setTimeout(() => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      const dataURL = sigCanvasRef.current
        .getCanvas()
        .toDataURL('image/png');
      setSignatureData(dataURL);
      setIsSigned(true);
    }
  }, 100);
};

  const handleClearSignature = () => {
    sigCanvasRef.current?.clear();
    setSignatureData('');
    setIsSigned(false);
  };

  // ── Validation ───────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!supplierId)   e.supplierId   = 'Supplier is required';
    if (!driverId)     e.driverId     = 'Driver is required';
    if (!deliveryDate) e.deliveryDate = 'Date is required';
    if (!selectedPoId) e.selectedPoId = 'Select a purchase order';
    if (new Date(deliveryDate) > new Date())
      e.deliveryDate = 'Date cannot be in the future';
    if (!lineItems.length)
      e.lineItems = 'No items loaded — select a purchase order first';
    if (!signatureData)
      e.signature = 'Driver signature is required before submitting';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async (evt) => {
    evt.preventDefault();
    if (!validate()) return;
    try {
      await onSubmit({
        supplierId,
        driverId,
        deliveryDate,
        purchaseOrderId: selectedPoId,
        signatureData,     // base64 PNG — backend stores this on the delivery note
        poCompleted,       // if true, backend marks the PO as 'completed'
      });
    } catch (err) {
      setErrors((p) => ({ ...p, general: err.message }));
    }
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-ZA') : '—');

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="form-modal">

      {/* Header */}
      <div className="form-modal-header">
        <div>
          <h2 className="form-modal-title">RECORD DELIVERY NOTE</h2>
          <p className="form-modal-subtitle">LOL-NOC · PROCUREMENT · NEW DELIVERY</p>
        </div>
        <button type="button" onClick={onCancel} className="btn-ghost">
          ✕ CANCEL
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-modal-body">

          {/* General error */}
          {errors.general && (
            <div className="alert-error">
              <p>⚠ {errors.general.toUpperCase()}</p>
            </div>
          )}

          {/* ── Step 1: Supplier, Driver, Date ─────────────── */}
          <div className="form-section">
            <p className="form-section-label">STEP 1 — SUPPLIER & DRIVER</p>

            <div className="form-grid-2">

              <div className="form-group">
                <label className="form-label">
                  SUPPLIER <span className="form-required">*</span>
                </label>
                <select
                  className="form-select"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {errors.supplierId && <p className="form-error">⚠ {errors.supplierId}</p>}
              </div>

              <div className="form-group">
                <label className="form-label">
                  DRIVER <span className="form-required">*</span>
                </label>
                <select
                  className="form-select"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  disabled={!supplierId || filteredDrivers.length === 0}
                >
                  <option value="">
                    {supplierId ? 'Select driver...' : 'Select supplier first'}
                  </option>
                  {filteredDrivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} · {d.license_number}</option>
                  ))}
                </select>
                {errors.driverId && <p className="form-error">⚠ {errors.driverId}</p>}
              </div>

            </div>

            <div className="form-group">
              <label className="form-label">
                DELIVERY DATE <span className="form-required">*</span>
              </label>
              <input
                type="date"
                className="form-input-half"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
              {errors.deliveryDate && <p className="form-error">⚠ {errors.deliveryDate}</p>}
            </div>
          </div>

          {/* ── Step 2: Select Purchase Order ──────────────── */}
          {supplierId && (
            <div className="form-section">
              <p className="form-section-label">STEP 2 — SELECT PURCHASE ORDER</p>

              {loadingPOs && (
                <p className="form-section-label">LOADING PURCHASE ORDERS...</p>
              )}

              {poError && !loadingPOs && (
                <div className="alert-error"><p>⚠ {poError.toUpperCase()}</p></div>
              )}

              {!loadingPOs && purchaseOrders.length > 0 && (
                <>
                  {purchaseOrders.map((po) => (
                    <button
                      key={po.id}
                      type="button"
                      onClick={() => handlePoSelect(po.id)}
                      className={`po-card${selectedPoId == po.id ? ' selected' : ''}`}
                    >
                      <div>
                        <p className="po-card-id">PURCHASE ORDER #{po.id}</p>
                        <p className="po-card-meta">
                          EXPECTED: {formatDate(po.expected_delivery_date)} · BY: {po.created_by_name}
                        </p>
                      </div>
                      {selectedPoId == po.id && (
                        <span className="badge badge-recorded">SELECTED ✓</span>
                      )}
                    </button>
                  ))}
                  {errors.selectedPoId && (
                    <p className="form-error">⚠ {errors.selectedPoId}</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 3: Expected Items (read-only from PO) ──── */}
          {selectedPoId && (
            <div className="form-section">
              <p className="form-section-label">STEP 3 — EXPECTED ITEMS FROM PURCHASE ORDER</p>

              {loadingItems ? (
                <p className="form-section-label">LOADING ITEMS...</p>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="line-item-cols"
                    style={{ gridTemplateColumns: '2fr 1fr 1fr 80px' }}>
                    <span>PRODUCT</span>
                    <span className="line-item-col-center">SKU</span>
                    <span className="line-item-col-center">EXPECTED QTY</span>
                    <span className="line-item-col-center">EXP KG</span>
                  </div>

                  {lineItems.map((item) => (
                    <div
                      key={item.purchaseOrderItemId}
                      className="line-item-row"
                      style={{ gridTemplateColumns: '2fr 1fr 1fr 80px' }}
                    >
                      <span className="note-line-product">{item.productName}</span>
                      <span className="note-line-qty">{item.sku || '—'}</span>
                      <input
                        type="number"
                        className="line-item-input-readonly"
                        value={item.expectedQuantity}
                        readOnly
                        tabIndex={-1}
                      />
                      <input
                        type="text"
                        className="line-item-input-readonly"
                        value={item.expectedWeightKg}
                        readOnly
                        tabIndex={-1}
                      />
                    </div>
                  ))}

                  <div className="info-notice">
                    <p>ℹ THESE ITEMS ARE PRE-POPULATED FROM THE PURCHASE ORDER AND ARE FOR REFERENCE ONLY</p>
                  </div>

                  {typeof errors.lineItems === 'string' && (
                    <p className="form-error">⚠ {errors.lineItems}</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 4: Driver Signature ────────────────────── */}
          {selectedPoId && lineItems.length > 0 && (
            <div className="signature-section">
              <p className="form-section-label">
                STEP 4 — DRIVER SIGNATURE <span className="form-required">*</span>
              </p>

              <SignatureCanvas
                ref={sigCanvasRef}
                onEnd={handleSignatureEnd}
                penColor="#201F1E"
                canvasProps={{
                  width:     548,
                  height:    160,
                  className: `signature-canvas-wrapper${errors.signature ? ' has-error' : ''}`,
                }}
              />

              <div className="signature-actions">
                <span className={isSigned ? 'signature-signed' : 'signature-hint'}>
                  {isSigned ? '✓ SIGNED' : 'SIGN ABOVE — DRIVER TO SIGN WITH FINGER OR MOUSE'}
                </span>
                <button
                  type="button"
                  onClick={handleClearSignature}
                  className="btn-clear-signature"
                >
                  CLEAR
                </button>
              </div>

              {errors.signature && (
                <p className="form-error">⚠ {errors.signature}</p>
              )}
            </div>
          )}

        </div>

        {/* PO completion checkbox — shown once signature is done */}
        {isSigned && selectedPoId && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-lol-bg)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={poCompleted}
                onChange={(e) => setPoCompleted(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-maroon)', cursor: 'pointer' }}
              />
              <div>
                <p style={{ fontSize: '9px', fontWeight: 900, color: 'var(--color-text)', textTransform: 'uppercase', margin: 0 }}>
                  Purchase order completed?
                </p>
                <p style={{ fontSize: '8px', color: 'var(--color-text-meta)', margin: '2px 0 0' }}>
                  Check this if all items from Purchase Order #{selectedPoId} have been fully delivered.
                  This will mark the PO as completed and remove it from future delivery options.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="form-modal-footer">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn-secondary"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !lineItems.length || !isSigned}
            className="btn-primary"
          >
            {isSubmitting ? 'RECORDING...' : 'RECORD DELIVERY'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProofOfDeliveryForm;
