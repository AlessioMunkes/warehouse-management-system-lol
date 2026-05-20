import React, { useState, useMemo, useEffect, useCallback } from 'react';

import DashboardHeader    from '../components/Procurement/DashboardHeader';
import DashboardSidebar   from '../components/Procurement/DashboardSidebar';
import DeliveryFilters    from '../components/Procurement/DeliveryFilters';
import DeliveryList       from '../components/Procurement/DeliveryList';
import ProofOfDeliveryForm from '../components/Procurement/ProofOfDeliveryForm';
import DeliveryNotePDF    from '../components/Procurement/DeliveryNotePDF';
import { apiGet, apiPost } from '../services/api';

// ─────────────────────────────────────────────────────────────
// src/pages/ProcurementDashboard.jsx
//
// Page-level orchestrator. Owns all state and data fetching.
// Renders layout and passes data + handlers down to components.
// No rendering logic lives here — only state and API calls.
// ─────────────────────────────────────────────────────────────

const ProcurementDashboard = ({ userName, userRole, userId, onLogout, onBack }) => {

  // ── Delivery data ─────────────────────────────────────────
  const [deliveries,  setDeliveries]  = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState('');

  // ── Reference data for the form ───────────────────────────
  const [suppliers,   setSuppliers]   = useState([]);
  const [drivers,     setDrivers]     = useState([]);

  // ── Filter state ──────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [dateRange,     setDateRange]     = useState('month');

  // ── UI state ──────────────────────────────────────────────
  const [activeMenu,       setActiveMenu]       = useState('procurement');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [isSubmitting,     setIsSubmitting]     = useState(false);
  const [pdfDelivery,      setPdfDelivery]      = useState(null);
  const [loadingPdf,       setLoadingPdf]       = useState(false);

  // ── Fetch deliveries ──────────────────────────────────────
  const fetchDeliveries = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiGet(`/api/deliveries?range=${dateRange}`);
      setDeliveries(res.data || []);
    } catch (err) {
      setError('Failed to load deliveries. Please try again.');
      setDeliveries([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  // ── Fetch suppliers and drivers once on mount ─────────────
  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [suppliersRes, driversRes] = await Promise.all([
          apiGet('/api/deliveries/suppliers'),
          apiGet('/api/deliveries/drivers'),
        ]);
        setSuppliers(suppliersRes.data || []);
        setDrivers(driversRes.data   || []);
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    fetchReferenceData();
  }, []);

  // ── Client-side filter ────────────────────────────────────
  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchSupplier = d.supplier_name?.toLowerCase().includes(q);
        const matchDriver   = d.driver_name?.toLowerCase().includes(q);
        const matchId       = d.driver_id_number?.toLowerCase().includes(q);
        if (!matchSupplier && !matchDriver && !matchId) return false;
      }
      return true;
    });
  }, [deliveries, statusFilter, searchQuery]);

  // ── Submit new delivery ───────────────────────────────────
  const handleRecord = async (formData) => {
    setIsSubmitting(true);
    try {
      await apiPost('/api/deliveries', {
        supplierId:      formData.supplierId,
        driverId:        formData.driverId,
        deliveryDate:    formData.deliveryDate,
        purchaseOrderId: formData.purchaseOrderId,
        signatureData:   formData.signatureData,
        poCompleted:     formData.poCompleted,     // ← pass checkbox value to backend
      });
      setShowDeliveryForm(false);
      fetchDeliveries();
    } catch (err) {
      setError(err.message || 'Failed to record delivery.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Fetch delivery for PDF modal ──────────────────────────
  const handleViewPdf = async (deliveryId) => {
    setLoadingPdf(true);
    try {
      const res = await apiGet(`/api/deliveries/${deliveryId}`);
      setPdfDelivery(res.data);
    } catch (err) {
      setError('Failed to load delivery details.');
    } finally {
      setLoadingPdf(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

        <DashboardHeader
          userName={userName}
          userRole={userRole}
          onLogout={onLogout}
        />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          <DashboardSidebar
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
            onBack={onBack}
          />

          {/* Main content */}
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>

            {error && (
              <div className="alert-error" style={{ marginBottom: '16px' }}>
                <p>⚠ {error.toUpperCase()}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button
                onClick={() => setShowDeliveryForm(true)}
                className="btn-primary"
              >
                + RECORD NEW DELIVERY
              </button>
            </div>

            <DeliveryFilters
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              dateRange={dateRange}
              setDateRange={setDateRange}
              onRefresh={fetchDeliveries}
              totalCount={deliveries.length}
              filteredCount={filtered.length}
            />

            <DeliveryList
              deliveries={filtered}
              isLoading={isLoading}
              onViewPdf={handleViewPdf}
              loadingPdf={loadingPdf}
            />

            <div className="footer-meta">
              [PROD-NODE-01] | LAST_SYNC: {new Date().toLocaleTimeString()} | SYS_OK
            </div>

          </div>
        </div>
      </div>

      {/* PDF modal */}
      {pdfDelivery && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1001, alignItems: 'flex-start', overflowY: 'auto' }}
          onClick={() => setPdfDelivery(null)}
        >
          <div
            style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <DeliveryNotePDF
              delivery={pdfDelivery}
              onClose={() => setPdfDelivery(null)}
            />
          </div>
        </div>
      )}

      {/* Record delivery modal */}
      {showDeliveryForm && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1000, alignItems: 'flex-start', overflowY: 'auto' }}
        >
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <ProofOfDeliveryForm
              onSubmit={handleRecord}
              isSubmitting={isSubmitting}
              suppliers={suppliers}
              drivers={drivers}
              onCancel={() => setShowDeliveryForm(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ProcurementDashboard;
