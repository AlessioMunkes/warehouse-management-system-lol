import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { apiGet } from '../../services/api';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/ProofOfDeliveryForm.jsx
//
// Workflow:
//   1. Worker selects supplier
//   2. Approved purchase orders for that supplier load automatically
//   3. Worker selects a PO — line items auto-populate from PO items
//   4. Expected qty and product are read-only (from the PO)
//   5. Worker fills in actual qty and actual weight only
//   6. Submit calls POST /api/deliveries
//
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

  const [filteredDrivers,  setFilteredDrivers]  = useState([]);
  const [purchaseOrders,   setPurchaseOrders]   = useState([]);
  const [errors,           setErrors]           = useState({});
  const [loadingPOs,       setLoadingPOs]       = useState(false);
  const [loadingItems,     setLoadingItems]     = useState(false);
  const [poError,          setPoError]          = useState('');

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

    // Filter drivers client-side
    setFilteredDrivers(
      drivers.filter((d) => d.supplier_id === parseInt(supplierId))
    );

    // Fetch approved POs for this supplier
    const fetchPOs = async () => {
      setLoadingPOs(true);
      setPoError('');
      try {
        const res = await apiGet(`/api/deliveries/purchase-orders?supplierId=${supplierId}`);
        setPurchaseOrders(res.data);
        if (res.data.length === 0) {
          setPoError('No approved purchase orders found for this supplier.');
        }
      } catch (err) {
        setPoError('Failed to load purchase orders.');
      } finally {
        setLoadingPOs(false);
      }
    };

    fetchPOs();
  }, [supplierId, drivers]);

  // ── When PO is selected: fetch items and auto-populate ───────
  const handlePoSelect = async (poId) => {
    setSelectedPoId(poId);
    setLineItems([]);
    setLoadingItems(true);
    try {
      const res = await apiGet(`/api/deliveries/purchase-orders/${poId}/items`);
      // Map PO items into line items — expected values pre-filled, actual blank
      setLineItems(
        res.data.map((item) => ({
          purchaseOrderItemId: item.purchase_order_item_id,
          productId:           item.product_id,
          productName:         item.product_name,
          expectedQuantity:    item.expected_quantity,
          expectedWeightKg:    item.expected_weight_kg || '',
        }))
      );
    } catch (err) {
      setPoError('Failed to load purchase order items.');
    } finally {
      setLoadingItems(false);
    }
  };
    


  // ── Validation ───────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!supplierId)   e.supplierId   = 'Supplier is required';
    if (!driverId)     e.driverId     = 'Driver is required';
    if (!deliveryDate) e.deliveryDate = 'Date is required';
    if (!selectedPoId) e.selectedPoId = 'Select a purchase order';
    if (new Date(deliveryDate) > new Date()) e.deliveryDate = 'Date cannot be in the future';
    if (!lineItems.length) e.lineItems = 'No items loaded — select a purchase order';

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
        lineItems: lineItems.map((item) => ({
          purchaseOrderItemId: item.purchaseOrderItemId,
          productId:           item.productId,
          expectedQuantity:    Number(item.expectedQuantity),
          expectedWeightKg:    Number(item.expectedWeightKg || 0),
        })),
      });
    } catch (err) {
      setErrors((p) => ({ ...p, general: err.message }));
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA') : '—';

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

          {/* ── Step 1: Supplier & Driver ───────────────────── */}
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
                <div className="alert-error">
                  <p>⚠ {poError.toUpperCase()}</p>
                </div>
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

          {/* ── Step 3: Record Actual Quantities ───────────── */}
          {selectedPoId && (
            <div>
              <p className="form-section-label">ITEM SUMMARY: QUANTITIES EXPECTED</p>

              {loadingItems ? (
                <p className="form-section-label">LOADING ITEMS...</p>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="line-item-cols" style={{ gridTemplateColumns: '2fr 110px 55px' }}>
                    <span>PRODUCT</span>
                    <span className="line-item-col-center">EXP KG</span>
                    <span className="line-item-col-center">EXP UNITS</span>
                  </div>

                  {lineItems.map((item, i) => {
                    const ie = Array.isArray(errors.lineItems) ? errors.lineItems[i] || {} : {};
                    const isDiscrepancy =
                      item.actualQuantity !== '' &&
                      Number(item.actualQuantity) !== Number(item.expectedQuantity);

                    return (
                      <div
                        key={item.purchaseOrderItemId}
                        className={`line-item-row${isDiscrepancy ? ' has-discrepancy' : ''}`}
                        style={{ gridTemplateColumns: '2fr 85px 50px' }}
                      >
                        {/* Product name — read only, from PO */}
                        <span className="note-line-product">{item.productName}</span>

                        {/* Expected weight — read only, from PO */}
                        <input
                          type="number"
                          className="line-item-input-readonly"
                          value={item.expectedWeightKg || ''}
                          readOnly
                          tabIndex={-1}
                          placeholder="—"
                        />

                        {/* Expected units amount — read only, from PO */}
                        <input
                          type="number"
                          className="line-item-input-readonly"
                          value={item.expectedQuantity|| ''}
                          readOnly
                          tabIndex={-1}
                          placeholder="—"
                        />


                      </div>
                    );
                  })}

                  {/* Auto-populate info notice */}
                  <div className="info-notice">
                    <p>ℹ PRODUCTS AND EXPECTED QUANTITIES ARE FROM THE PURCHASE ORDER</p>
                  </div>

                  {typeof errors.lineItems === 'string' && (
                    <p className="form-error">⚠ {errors.lineItems}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

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
            disabled={isSubmitting || !lineItems.length}
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
