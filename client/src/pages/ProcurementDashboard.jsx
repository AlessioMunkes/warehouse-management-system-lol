// ─────────────────────────────────────────────────────────────
// src/pages/ProcurementDashboard.jsx
// ─────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate }        from 'react-router-dom';
import { useAuth }            from '../context/AuthContext';
import DashboardHeader        from '../features/procurement/components/DashboardHeader';
import DashboardSidebar       from '../features/procurement/components/DashboardSidebar';
import DeliveryFilters        from '../features/procurement/components/DeliveryFilters';
import DeliveryList           from '../features/procurement/components/DeliveryList';
import ProofOfDeliveryForm    from '../features/procurement/components/ProofOfDeliveryForm';
import DeliveryNotePDF        from '../features/procurement/components/DeliveryNotePDF';
import { apiGet, apiPost }    from '../services/api';

const ProcurementDashboard = () => {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  // ── Delivery data ───────────────────────────────────────────
  const [deliveries,  setDeliveries]  = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState('');

  // ── Reference data for the form ────────────────────────────
  const [suppliers,   setSuppliers]   = useState([]);
  const [drivers,     setDrivers]     = useState([]);

  // ── Filter state ────────────────────────────────────────────
  const [searchQuery,  setSearchQuery]  = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange,    setDateRange]    = useState('month');

  // ── UI state ────────────────────────────────────────────────
  const [activeMenu,        setActiveMenu]        = useState('procurement');
  const [showDeliveryForm,  setShowDeliveryForm]  = useState(false);
  const [isSubmitting,      setIsSubmitting]      = useState(false);
  const [pdfDelivery,       setPdfDelivery]       = useState(null);
  const [loadingPdf,        setLoadingPdf]        = useState(false);

  // ── Fetch deliveries ────────────────────────────────────────
  // Refetches whenever dateRange changes or refreshKey is bumped
  // (manual refresh / after a successful submission).
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshDeliveries = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let ignore = false;
    const loadDeliveries = async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await apiGet(`/api/deliveries?range=${dateRange}`);
        if (!ignore) setDeliveries(res.data || []);
      } catch {
        if (!ignore) {
          setError('Failed to load deliveries. Please try again.');
          setDeliveries([]);
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    loadDeliveries();
    return () => { ignore = true; };
  }, [dateRange, refreshKey]);

  // ── Fetch reference data once on mount ─────────────────────
  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [suppliersRes, driversRes] = await Promise.all([
          apiGet('/api/deliveries/suppliers'),
          apiGet('/api/deliveries/drivers'),
        ]);
        setSuppliers(suppliersRes.data || []);
        setDrivers(driversRes.data     || []);
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    fetchReferenceData();
  }, []);

  // ── Client-side filter ──────────────────────────────────────
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

  // ── Submit new delivery ─────────────────────────────────────
  const handleRecord = async (formData) => {
    setIsSubmitting(true);
    try {
      await apiPost('/api/deliveries', {
        supplierId:      formData.supplierId,
        driverId:        formData.driverId,
        deliveryDate:    formData.deliveryDate,
        purchaseOrderId: formData.purchaseOrderId,
        signatureData:   formData.signatureData,
        poCompleted:     formData.poCompleted,
      });
      setShowDeliveryForm(false);
      refreshDeliveries();
    } catch (err) {
      setError(err.message || 'Failed to record delivery.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── View PDF ────────────────────────────────────────────────
  const handleViewPdf = async (deliveryId) => {
    setLoadingPdf(true);
    try {
      const res = await apiGet(`/api/deliveries/${deliveryId}`);
      setPdfDelivery(res.data);
    } catch {
      setError('Failed to load delivery details.');
    } finally {
      setLoadingPdf(false);
    }
  };

  // ── Logout ──────────────────────────────────────────────────
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleBack = () => navigate('/noc');

  // ── Render ──────────────────────────────────────────────────
  return (
    <>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

        <DashboardHeader
          userName={user?.firstName}
          userRole={user?.role}
          onLogout={handleLogout}
        />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          <DashboardSidebar
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
            onBack={handleBack}
          />

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
              onRefresh={refreshDeliveries}
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