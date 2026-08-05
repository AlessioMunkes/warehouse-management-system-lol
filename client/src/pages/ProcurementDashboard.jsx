// ─────────────────────────────────────────────────────────────
// src/pages/ProcurementDashboard.jsx
//
// Records a delivery against a purchase order. Payload matches
// the CONFIRMED backend contract (delivery.service.js createDelivery):
// only supplierId, driverId, deliveryDate, purchaseOrderId,
// signatureData, poCompleted are read server-side. receivedBy is
// derived from the JWT — never sent from the frontend.
//
// NOTE: "Flag for return" is currently UI-only. The backend has
// no fields yet for flaggedForReturn / returnReason / returnDetails,
// so nothing is persisted or routed to a manager when a worker
// flags a delivery. See the note shown on the success screen —
// remove it once the backend supports this properly.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

const getValidationErrors = ({
  supplierId, deliveryDate, purchaseOrderId,
  decision, reason, signatureData,
}) => {
  const errors = [];
  if (!supplierId) errors.push('Choose a supplier.');

  if (!deliveryDate) errors.push('Pick a delivery date.');
  if (!purchaseOrderId) errors.push('Choose a purchase order.');
  if (!decision) errors.push('Accept the delivery or flag it for return.');
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
  const [poItems, setPoItems] = useState([]);

  // ── Form state ───────────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('');

  const [deliveryDate, setDeliveryDate] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [decision, setDecision] = useState(null); // 'accept' | 'return'
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [signatureData, setSignatureData] = useState(null);

  // ── Submission state ─────────────────────────────────────────
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ── PDF state ──────────────────────────────────────────────
  const [pdfDelivery, setPdfDelivery] = useState(null);

  // Load suppliers once on mount.
  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  // Fetch drivers + purchase orders whenever the supplier changes.
  useEffect(() => {
    if (supplierId) {
     
      getPurchaseOrders(supplierId).then(setPurchaseOrders).catch(console.error);
    }
  }, [supplierId]);

  // Fetch expected items the moment a PO is selected.
  useEffect(() => {
    if (purchaseOrderId) {
      getPurchaseOrderItems(purchaseOrderId).then(setPoItems).catch(console.error);
    }
  }, [purchaseOrderId]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSupplierChange = (newSupplierId) => {
    setSupplierId(newSupplierId);
   
    setPurchaseOrderId('');
    setPoItems([]);
    
    setPurchaseOrders([]);
  };

  const handlePurchaseOrderChange = (newPurchaseOrderId) => {
    setPurchaseOrderId(newPurchaseOrderId);
    if (!newPurchaseOrderId) {
      setPoItems([]);
    }
  };

  const validationErrors = getValidationErrors({
    supplierId, deliveryDate, purchaseOrderId, decision, reason, signatureData,
  });

  const selectedPO = purchaseOrders.find((po) => String(po.id) === String(purchaseOrderId));
  const selectedSupplier = suppliers.find((s) => String(s.id) === String(supplierId));

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    setSubmitError('');

    if (validationErrors.length > 0) return;

    setIsSubmitting(true);
    try {
      // Payload trimmed to match the CONFIRMED backend contract —
      // delivery.service.js createDelivery only reads these fields.
      // decision/reason/details are captured for the UX flow only;
      // they are NOT sent, since the backend has no fields for them
      // yet (see file header note).
      const res = await apiPost('/api/deliveries', {
        supplierId,
        
        deliveryDate,
        purchaseOrderId,
        signatureData,
        poCompleted: decision === 'accept',
      });

      // Pull the full saved record so the delivery note can be
      // rendered with real data (id, timestamps, items, etc.)
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
          <StepCard number="✓" title={decision === 'accept' ? 'Delivery recorded' : 'Delivery flagged'}>
            <p className="form-helper-text">
              {decision === 'accept'
                ? 'This delivery has been recorded successfully.'
                : 'This delivery has been marked as flagged in this session.'}
            </p>

            {decision === 'return' && (
              <p className="alert-notice">
                Note: manager notification for flagged deliveries isn't wired up yet —
                please follow up with your manager directly for now.
              </p>
            )}

            <Button variant="primary" onClick={() => navigate('/programmes/noc')}>
              Back to Nourish Our Children
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
        <StepCard number={1} title="Choose the supplier and driver">
          <Dropdown
            label="Supplier"
            required
            value={supplierId}
            onChange={handleSupplierChange}
            placeholder="Select a supplier"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Dropdown
           
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

          {poItems.length > 0 && (
            <div className="data-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Expected qty</th>
                    <th>Expected weight</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((item) => (
                    <tr key={item.purchase_order_item_id}>
                      <td>{item.product_name}</td>
                      <td>{item.expected_quantity}</td>
                      <td>{item.expected_weight_kg ? `${item.expected_weight_kg}kg` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StepCard>

        {/* ── Step 3 ──────────────────────────────────────────── */}
        <StepCard number={3} title="The delivery decision">
          <p className="form-helper-text">
            If something's wrong with this delivery, flag it here.
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
            <>
              <ReasonPicker
                selectedReason={reason}
                onSelectReason={setReason}
                details={details}
                onDetailsChange={setDetails}
              />
              
            </>
          )}
        </StepCard>

        {/* ── Step 4 ──────────────────────────────────────────── */}
        <StepCard number={4} title="Sign to confirm">
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