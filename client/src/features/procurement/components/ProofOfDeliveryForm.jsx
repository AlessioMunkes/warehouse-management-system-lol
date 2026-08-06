import { useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { apiGet } from "../../../services/api";

// ─────────────────────────────────────────────────────────────
// src/features/procurement/components/ProofOfDeliveryForm.jsx
//
// Workflow:
//   Step 1 — Select supplier and delivery date
//   Step 2 — Select approved purchase order
//   Step 3 — Confirm what actually arrived (defaults to the PO
//            quantities; the worker edits any line that differs)
//   Step 4 — Driver signs the digital signature pad
//
// Quantities are NOT reference-only. What is entered here is what
// gets added to stock, so a short delivery must be corrected on the
// line rather than accepted silently. Any line that differs from the
// order requires a reason, and an over-delivery must be explicitly
// accepted into stock or rejected back to the ordered quantity.
//
// Signature is saved as a base64 PNG string and sent with the form
// submission to be stored on the delivery note.
// ─────────────────────────────────────────────────────────────

const ProofOfDeliveryForm = ({
  onSubmit,
  onCancel,
  isSubmitting = false,
  suppliers    = [],
}) => {
  const [supplierId,    setSupplierId]    = useState('');
  const [deliveryDate,  setDeliveryDate]  = useState(new Date().toISOString().split('T')[0]);
  const [selectedPoId,  setSelectedPoId]  = useState('');
  const [lineItems,     setLineItems]     = useState([]);
  const [signatureData, setSignatureData] = useState('');

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [errors,         setErrors]         = useState({});
  const [loadingPOs,     setLoadingPOs]     = useState(false);
  const [loadingItems,   setLoadingItems]   = useState(false);
  const [poError,        setPoError]        = useState('');
  const [isSigned,       setIsSigned]       = useState(false);

  const [poCompleted, setPoCompleted] = useState(false);

  const sigCanvasRef = useRef(null);

  // ── When supplier changes: reset and fetch POs ────────────────
  useEffect(() => {
    setSelectedPoId('');
    setLineItems([]);
    setPurchaseOrders([]);
    setPoError('');

    if (!supplierId) return;

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
  }, [supplierId]);

  // ── When PO is selected: fetch and auto-populate items ────────
  // Received quantity defaults to the expected quantity so that the
  // common case (everything arrived) needs no typing at all.
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
          sku:                 item.sku || '',
          unit:                item.default_unit || '',
          expectedQuantity:    Number(item.expected_quantity),
          expectedWeightKg:    item.expected_weight_kg || '—',
          receivedQuantity:    Number(item.expected_quantity),
          overAction:          'accept',
          discrepancyReason:   '',
        }))
      );
    } catch {
      setPoError('Failed to load purchase order items.');
    } finally {
      setLoadingItems(false);
    }
  };

  // ── Line editing ─────────────────────────────────────────────
  const updateLine = (id, patch) =>
    setLineItems((prev) =>
      prev.map((l) => (l.purchaseOrderItemId === id ? { ...l, ...patch } : l))
    );

  const isBlank    = (l) => l.receivedQuantity === '' || l.receivedQuantity === null;
  const hasVariance = (l) =>
    !isBlank(l) && Number(l.receivedQuantity) !== Number(l.expectedQuantity);
  const isOver      = (l) =>
    !isBlank(l) && Number(l.receivedQuantity) > Number(l.expectedQuantity);

  // What will actually be added to stock for this line — a rejected
  // surplus is capped back to the ordered quantity.
  const acceptedQty = (l) => {
    if (isBlank(l)) return 0;
    const received = Number(l.receivedQuantity);
    if (isOver(l) && l.overAction === 'reject') return Number(l.expectedQuantity);
    return received;
  };

  const varianceLabel = (l) => {
    const diff = acceptedQty(l) - Number(l.expectedQuantity);
    if (diff === 0) return null;
    return diff > 0 ? `+${diff} over` : `${diff} short`;
  };

  const discrepancyCount = lineItems.filter(hasVariance).length;

  // ── Signature handlers ───────────────────────────────────────
  const handleSignatureEnd = () => {
    setTimeout(() => {
      if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
        const dataURL = sigCanvasRef.current.getCanvas().toDataURL('image/png');
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
  // Mirrors the server rules so the worker gets feedback before the
  // round trip. The server re-checks all of this — this is not the
  // enforcement point.
  const validate = () => {
    const e = {};
    if (!supplierId)   e.supplierId   = 'Supplier is required';
    if (!deliveryDate) e.deliveryDate = 'Date is required';
    if (!selectedPoId) e.selectedPoId = 'Select a purchase order';
    if (new Date(deliveryDate) > new Date())
      e.deliveryDate = 'Date cannot be in the future';

    if (!lineItems.length) {
      e.lineItems = 'No items loaded — select a purchase order first';
    } else if (lineItems.some((l) => isBlank(l) || Number(l.receivedQuantity) < 0)) {
      e.lineItems = 'Received quantity must be zero or more on every line';
    } else if (lineItems.some((l) => hasVariance(l) && !l.discrepancyReason.trim())) {
      e.lineItems = 'Give a reason for every line that differs from the order';
    }

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
        deliveryDate,
        purchaseOrderId: selectedPoId,
        signatureData,   // base64 PNG — backend stores this on the delivery note
        poCompleted,     // if true, backend marks the PO as 'completed'
        lineItems: lineItems.map((l) => ({
          purchaseOrderItemId: l.purchaseOrderItemId,
          receivedQuantity:    Number(l.receivedQuantity),
          overAction:          l.overAction,
          discrepancyReason:   l.discrepancyReason.trim(),
        })),
      });
    } catch (err) {
      setErrors((p) => ({ ...p, general: err.message }));
    }
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-ZA') : '—');

  const GRID = '2fr 0.8fr 0.8fr 1fr 0.8fr';

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

          {/* ── Step 1: Supplier, Date ─────────────────────────── */}
          <div className="form-section">
            <p className="form-section-label">STEP 1 — SUPPLIER</p>

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

          {/* ── Step 2: Select Purchase Order ──────────────────── */}
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

          {/* ── Step 3: Confirm what actually arrived ──────────── */}
          {selectedPoId && (
            <div className="form-section">
              <p className="form-section-label">STEP 3 — CONFIRM WHAT ARRIVED</p>

              {loadingItems ? (
                <p className="form-section-label">LOADING ITEMS...</p>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="line-item-cols" style={{ gridTemplateColumns: GRID }}>
                    <span>PRODUCT</span>
                    <span className="line-item-col-center">SKU</span>
                    <span className="line-item-col-center">ORDERED</span>
                    <span className="line-item-col-center">RECEIVED</span>
                    <span className="line-item-col-center">UNIT</span>
                  </div>

                  {lineItems.map((item) => {
                    const variance = hasVariance(item);
                    return (
                      <div key={item.purchaseOrderItemId}>
                        <div
                          className="line-item-row"
                          style={{ gridTemplateColumns: GRID }}
                        >
                          <span className="note-line-product">{item.productName}</span>
                          <span className="note-line-qty">{item.sku || '—'}</span>
                          <input
                            type="text"
                            className="line-item-input-readonly"
                            value={item.expectedQuantity}
                            readOnly
                            tabIndex={-1}
                          />
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="line-item-input"
                            value={item.receivedQuantity}
                            onChange={(e) =>
                              updateLine(item.purchaseOrderItemId, {
                                receivedQuantity:
                                  e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                          />
                          <span className="note-line-qty">{item.unit || '—'}</span>
                        </div>

                        {/* Discrepancy capture — only shown when the line differs */}
                        {variance && (
                          <div
                            style={{
                              display:      'flex',
                              flexDirection:'column',
                              gap:          '8px',
                              padding:      '10px 12px',
                              margin:       '0 0 8px',
                              borderLeft:   '3px solid var(--color-maroon)',
                              background:   'var(--color-lol-bg)',
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize: '12px',
                                fontWeight: 900,
                                textTransform: 'uppercase',
                                color: 'var(--color-maroon)',
                              }}
                            >
                              ⚠ {varianceLabel(item)} — {item.productName}
                            </p>

                            {isOver(item) && (
                              <select
                                className="form-select"
                                value={item.overAction}
                                onChange={(e) =>
                                  updateLine(item.purchaseOrderItemId, {
                                    overAction: e.target.value,
                                  })
                                }
                              >
                                <option value="accept">
                                  Accept the surplus into stock ({acceptedQty(item)} {item.unit})
                                </option>
                                <option value="reject">
                                  Reject the surplus — take {item.expectedQuantity} {item.unit} only
                                </option>
                              </select>
                            )}

                            <input
                              type="text"
                              className="form-input"
                              placeholder="Reason — required (e.g. supplier short-shipped, crate damaged)"
                              value={item.discrepancyReason}
                              onChange={(e) =>
                                updateLine(item.purchaseOrderItemId, {
                                  discrepancyReason: e.target.value,
                                })
                              }
                            />

                            <p
                              style={{
                                margin: 0,
                                fontSize: '11px',
                                color: 'var(--color-text-meta)',
                              }}
                            >
                              {acceptedQty(item)} {item.unit} will be added to stock.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="info-notice">
                    <p>
                      ℹ QUANTITIES DEFAULT TO THE PURCHASE ORDER. EDIT ANY LINE THAT
                      DIFFERS — WHAT IS ENTERED HERE IS WHAT GETS ADDED TO STOCK.
                    </p>
                  </div>

                  {discrepancyCount > 0 && (
                    <div className="alert-error">
                      <p>
                        ⚠ {discrepancyCount} LINE{discrepancyCount > 1 ? 'S' : ''} DIFFER
                        FROM THE ORDER — THIS DELIVERY WILL BE FLAGGED
                      </p>
                    </div>
                  )}

                  {typeof errors.lineItems === 'string' && (
                    <p className="form-error">⚠ {errors.lineItems}</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 4: Driver Signature ───────────────────────── */}
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
                <p style={{ fontSize: '13px', fontWeight: 900, color: 'var(--color-text)', textTransform: 'uppercase', margin: 0 }}>
                  Purchase order completed?
                </p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-meta)', margin: '2px 0 0' }}>
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