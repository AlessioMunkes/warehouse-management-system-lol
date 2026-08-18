// ─────────────────────────────────────────────────────────────
// src/pages/ProcurementDashboard.jsx
//
// Records a delivery against a purchase order.
//
// Quantities are per-line and editable. What is entered here is what
// gets added to stock — the purchase order supplies the defaults, not
// the truth. Any line that differs from the order needs a reason, and
// the whole note is saved with status 'flagged' when that happens.
//
// receivedBy is derived from the JWT — never sent from the frontend.
// The server re-reads the purchase order and matches on
// purchase_order_item_id, so nothing here is trusted for stock maths.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { STAFF } from '../routes/paths';
import TaskNavGrid from '../features/procurement/components/TaskNavGrid';
import PageHeader from '../features/procurement/components/PageHeader';
import StepCard from '../features/procurement/components/StepCard';
import Dropdown from '../features/procurement/components/Dropdown';
import DatePicker from '../features/procurement/components/DatePicker';
import DecisionCard from '../features/procurement/components/DecisionCard';
import ReasonPicker from '../features/procurement/components/ReasonPicker';
import SignaturePad from '../features/procurement/components/SignaturePad';
import ValidationSummary from '../features/procurement/components/ValidationSummary';
import Button from '../features/procurement/components/Button';
import DeliveryNotePDF from '../features/procurement/components/DeliveryNotePDF';
import { apiGet, apiPost } from '../services/api';

// Reference-data fetchers — wired to the real API layer.
const getSuppliers = () => apiGet('/api/deliveries/suppliers').then((r) => r.data || []);
const getPurchaseOrders = (supplierId) => apiGet(`/api/deliveries/purchase-orders?supplierId=${supplierId}`).then((r) => r.data || []);
const getPurchaseOrderItems = (purchaseOrderId) => apiGet(`/api/deliveries/purchase-orders/${purchaseOrderId}/items`).then((r) => r.data || []);

// ── Line helpers ─────────────────────────────────────────────
const isBlank = (l) => l.receivedQuantity === '' || l.receivedQuantity === null;

const isOver = (l) =>
  !isBlank(l) && Number(l.receivedQuantity) > Number(l.expectedQuantity);

// What will actually be added to stock — a rejected surplus is capped
// back to the ordered quantity.
const acceptedQty = (l) => {
  if (isBlank(l)) return 0;
  if (isOver(l) && l.overAction === 'reject') return Number(l.expectedQuantity);
  return Number(l.receivedQuantity);
};

const hasVariance = (l) =>
  !isBlank(l) && Number(l.receivedQuantity) !== Number(l.expectedQuantity);
const varianceLabel = (l) => {
  const diff = acceptedQty(l) - Number(l.expectedQuantity);
  if (diff === 0) return null;
  return diff > 0 ? `${diff} over` : `${Math.abs(diff)} short`;
};

const getValidationErrors = ({
  supplierId, deliveryDate, purchaseOrderId,
  decision, reason, signatureData, lines,
}) => {
  const errors = [];
  if (!supplierId) errors.push('Choose a supplier.');
  if (!deliveryDate) errors.push('Pick a delivery date.');
  if (!purchaseOrderId) errors.push('Choose a purchase order.');
  if (purchaseOrderId && lines.length === 0) errors.push('This purchase order has no items to receive.');

  if (lines.some(isBlank)) errors.push('Enter a received quantity for every line.');
  if (lines.some((l) => !isBlank(l) && Number(l.receivedQuantity) < 0))
    errors.push('Received quantities cannot be negative.');

  const varied = lines.filter(hasVariance);
  if (varied.some((l) => !l.note.trim()))
    errors.push('Explain every line that differs from the order.');

  if (!decision) errors.push('Accept the delivery or flag it for return.');
  if (varied.length > 0 && decision === 'accept')
    errors.push('Some lines differ from the order — flag this delivery instead of accepting it.');
  if (decision === 'return' && !reason) errors.push('Pick a reason for flagging.');

  if (!signatureData) errors.push('Sign to confirm.');
  return errors;
};

const ProcurementDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // ── Reference data ──────────────────────────────────────────
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  // ── Form state ───────────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [lines, setLines] = useState([]);
  const [decision, setDecision] = useState(null); // 'accept' | 'return'
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [poCompleted, setPoCompleted] = useState(false);
  const [signatureData, setSignatureData] = useState(null);

  // ── Submission state ─────────────────────────────────────────
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [warnings, setWarnings] = useState([]);

  // ── PDF state ──────────────────────────────────────────────
  const [pdfDelivery, setPdfDelivery] = useState(null);

  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  useEffect(() => {
    if (supplierId) {
      getPurchaseOrders(supplierId).then(setPurchaseOrders).catch(console.error);
    }
  }, [supplierId]);

  // Fetch expected items the moment a PO is selected, and seed each
  // line's received quantity with the ordered amount so the common
  // case (everything arrived) needs no typing.
  // No setLines([]) on the empty branch: `lines` starts as [] and both
  // handleSupplierChange and handlePurchaseOrderChange already clear it
  // synchronously whenever purchaseOrderId is cleared. Clearing here too
  // was redundant and triggered react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!purchaseOrderId) return;
    getPurchaseOrderItems(purchaseOrderId)
      .then((items) =>
        setLines(
          items.map((item) => ({
            purchaseOrderItemId: item.purchase_order_item_id,
            productName:         item.product_name,
            sku:                 item.sku || '',
            unit:                item.default_unit || '',
            expectedQuantity:    Number(item.expected_quantity),
            expectedWeightKg:    item.expected_weight_kg,
            receivedQuantity:    Number(item.expected_quantity),
            overAction:          'accept',
            note:                '',
          }))
        )
      )
      .catch(console.error);
  }, [purchaseOrderId]);

  const updateLine = (id, patch) =>
    setLines((prev) =>
      prev.map((l) => (l.purchaseOrderItemId === id ? { ...l, ...patch } : l))
    );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSupplierChange = (newSupplierId) => {
    setSupplierId(newSupplierId);
    setPurchaseOrderId('');
    setLines([]);
    setPurchaseOrders([]);
  };

  const handlePurchaseOrderChange = (newPurchaseOrderId) => {
    setPurchaseOrderId(newPurchaseOrderId);
    if (!newPurchaseOrderId) setLines([]);
  };

  const validationErrors = getValidationErrors({
    supplierId, deliveryDate, purchaseOrderId, decision, reason, signatureData, lines,
  });

  const selectedPO = purchaseOrders.find((po) => String(po.id) === String(purchaseOrderId));
  const selectedSupplier = suppliers.find((s) => String(s.id) === String(supplierId));
  const variedLines = lines.filter(hasVariance);

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    setSubmitError('');

    if (validationErrors.length > 0) return;

    setIsSubmitting(true);
    try {
      const res = await apiPost('/api/deliveries', {
        supplierId,
        deliveryDate,
        purchaseOrderId,
        signatureData,
        poCompleted,
        lineItems: lines.map((l) => ({
          purchaseOrderItemId: l.purchaseOrderItemId,
          receivedQuantity:    Number(l.receivedQuantity),
          overAction:          l.overAction,
          // The picker gives the category, the line note gives the
          // specifics — both end up in discrepancy_reason.
          discrepancyReason: hasVariance(l)
            ? [reason, l.note.trim(), details.trim()].filter(Boolean).join(' — ')
            : '',
        })),
      });

      setWarnings(res?.data?.warnings || []);

      const deliveryId = res?.data?.id;
      if (deliveryId) {
        try {
          const full = await apiGet(`/api/deliveries/${deliveryId}`);
          setPdfDelivery(full.data);
        } catch (fetchErr) {
          console.error('Delivery recorded, but failed to load its note:', fetchErr);
        }
      }

      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err.message || 'Could not record this delivery. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="page-light">
        <PageHeader showBack onLogout={handleLogout} onInfo={() => navigate('/programmes/noc/info')} />
        <TaskNavGrid />
        <main className="decanting-content">
          <StepCard number="✓" title={variedLines.length > 0 ? 'Delivery recorded and flagged' : 'Delivery recorded'}>
            <p className="form-helper-text">
              {variedLines.length > 0
                ? `Stock has been updated with what actually arrived. ${variedLines.length} line${variedLines.length > 1 ? 's were' : ' was'} flagged for your manager to review.`
                : 'This delivery has been recorded and stock has been updated.'}
            </p>

            {warnings.length > 0 && (
              <div className="alert-notice">
                {warnings.map((w, i) => (
                  <p key={i}>{w.message}</p>
                ))}
              </div>
            )}

            <Button variant="primary" onClick={() => navigate(STAFF.home)}>
              Back to main menu
            </Button>
          </StepCard>

          {pdfDelivery && (
            <DeliveryNotePDF
              delivery={pdfDelivery}
              onClose={() => setPdfDelivery(null)}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="page-light">
      <PageHeader showBack onLogout={handleLogout} onInfo={() => navigate('/programmes/noc/info')} />
      <TaskNavGrid />

      <main className="decanting-content">
        <div className="page-title-row">
          <h1 className="programme-select-heading">Procurement</h1>
          <p className="form-helper-text">Record stock arriving against a purchase order.</p>
        </div>

        {hasAttemptedSubmit && <ValidationSummary errors={validationErrors} />}
        {submitError && (
          <div className="alert-error">
            <p>{submitError}</p>
          </div>
        )}

        {/* ── Step 1 ──────────────────────────────────────────── */}
        <StepCard number={1} title="Choose the supplier">
          <Dropdown
            label="Supplier"
            required
            value={supplierId}
            onChange={handleSupplierChange}
            placeholder="Select a supplier"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />

          <DatePicker
            label="Delivery date"
            required
            value={deliveryDate}
            onChange={setDeliveryDate}
          />
        </StepCard>

        {/* ── Step 2 ──────────────────────────────────────────── */}
        <StepCard number={2} title="Choose the purchase order">
          <p className="form-helper-text">
            Pick the order this delivery is against. Expected items will show below.
          </p>
          <Dropdown
            label="Purchase order"
            required
            value={purchaseOrderId}
            onChange={handlePurchaseOrderChange}
            placeholder={supplierId ? 'Select a purchase order' : 'Pick a supplier first'}
            disabled={!supplierId}
            options={purchaseOrders.map((po) => ({
              value: po.id,
              label: `Expected ${po.expected_delivery_date} — created by ${po.created_by_name || 'unknown'}`,
            }))}
          />

          {selectedPO && (
            <p className="form-helper-text pdf-doc-id-label--spaced">
              You selected: expected {selectedPO.expected_delivery_date}
              {selectedSupplier ? ` — ${selectedSupplier.name}` : ''}
            </p>
          )}
        </StepCard>

        {/* ── Step 3 — what actually arrived ──────────────────── */}
        <StepCard number={3} title="Confirm what arrived">
          {lines.length === 0 ? (
            <p className="form-helper-text">
              Choose a purchase order above and its items will appear here.
            </p>
          ) : (
            <>
              <p className="form-helper-text">
                Quantities default to the order. Change any line that came up short
                or over — what you enter here is what gets added to stock.
              </p>

              <div className="data-table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Unit</th>
                      <th>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.purchaseOrderItemId}>
                        <td>{l.productName}</td>
                        <td>{l.expectedQuantity}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="form-input"
                            style={{ maxWidth: 110 }}
                            value={l.receivedQuantity}
                            onChange={(e) =>
                              updateLine(l.purchaseOrderItemId, {
                                receivedQuantity:
                                  e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>{l.unit || '—'}</td>
                        <td>
                          {hasVariance(l) ? (
                            <span className="badge badge-flagged">{varianceLabel(l)}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Per-line follow-up, only for lines that differ */}
              {variedLines.map((l) => (
                <div
                  key={l.purchaseOrderItemId}
                  style={{
                    marginTop: 12,
                    padding: '12px 14px',
                    borderLeft: '3px solid var(--color-maroon)',
                    background: 'var(--color-lol-bg)',
                  }}
                >
                  <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
                    {l.productName} — {varianceLabel(l)}
                  </p>

                  {isOver(l) && (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label">More arrived than was ordered</label>
                      <select
                        className="form-input"
                        value={l.overAction}
                        onChange={(e) =>
                          updateLine(l.purchaseOrderItemId, { overAction: e.target.value })
                        }
                      >
                        <option value="accept">
                          Accept the extra — add all {l.receivedQuantity} {l.unit} to stock
                        </option>
                        <option value="reject">
                          Turn the extra away — add {l.expectedQuantity} {l.unit} only
                        </option>
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">
                      What happened? <span className="form-required">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. supplier short-shipped two crates"
                      value={l.note}
                      onChange={(e) =>
                        updateLine(l.purchaseOrderItemId, { note: e.target.value })
                      }
                    />
                  </div>

                  <p className="form-helper-text" style={{ margin: '6px 0 0' }}>
                    {acceptedQty(l)} {l.unit} will be added to stock.
                  </p>
                </div>
              ))}
            </>
          )}
        </StepCard>

        {/* ── Step 4 — decision ───────────────────────────────── */}
        <StepCard number={4} title="The delivery decision">
          <p className="form-helper-text">
            {variedLines.length > 0
              ? `${variedLines.length} line${variedLines.length > 1 ? 's differ' : ' differs'} from the order — this delivery needs to be flagged.`
              : "If something's wrong with this delivery, flag it here."}
          </p>

          <div className="decision-row">
            <DecisionCard
              icon="circle-check"
              title="Accept this delivery"
              subtitle="Everything looks right"
              variant="accept"
              selected={decision === 'accept'}
              onClick={() => setDecision('accept')}
            />
            <DecisionCard
              icon="alert-triangle"
              title="Flag for return"
              subtitle="Something's wrong"
              variant="return"
              selected={decision === 'return'}
              onClick={() => setDecision('return')}
            />
          </div>

          {decision === 'return' && (
            <ReasonPicker
              selectedReason={reason}
              onSelectReason={setReason}
              details={details}
              onDetailsChange={setDetails}
            />
          )}

          {/* PO completion is its own decision — a delivery can be
              accepted without the order being finished. */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={poCompleted}
                onChange={(e) => setPoCompleted(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 3, accentColor: 'var(--color-maroon)', cursor: 'pointer' }}
              />
              <span>
                <span style={{ fontWeight: 700 }}>This purchase order is now complete</span>
                <span className="form-helper-text" style={{ display: 'block', margin: 0 }}>
                  Only tick this if nothing further is expected against this order.
                  It will stop appearing in the list above.
                </span>
              </span>
            </label>
          </div>
        </StepCard>

        {/* ── Step 5 ──────────────────────────────────────────── */}
        <StepCard number={5} title="Sign to confirm">
          <SignaturePad onChange={setSignatureData} />
        </StepCard>

        <div className="decanting-save-row">
          <Button
            variant="primary"
            icon="truck-delivery"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Recording…' : 'Record delivery'}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ProcurementDashboard;