// ─────────────────────────────────────────────────────────────
// src/pages/ProcurementDashboard.jsx
//
// Fetches all data from the real backend.
// No hardcoded deliveries, suppliers, drivers, or products.
// ─────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ProofOfDeliveryForm from '../components/Procurement/ProofOfDeliveryForm';
import { apiGet, apiPost } from '../services/api';
import logo from '../assets/LOL_Logo.jpg';

const MENU = [
  { id: 'procurement', label: 'PROCUREMENT',   active: true  },
  { id: 'ecdDispatch', label: 'ECD DISPATCH',  active: false },
  { id: 'decanting',   label: 'DECANTING',     active: false },
  { id: 'packing',     label: 'PACKING',        active: false },
  { id: 'system',      label: 'SYSTEM CONFIG',  active: false },
];

// Date range options shown in the filter dropdown
const DATE_RANGES = [
  { value: 'today', label: 'TODAY'        },
  { value: 'week',  label: 'LAST 7 DAYS'  },
  { value: 'month', label: 'LAST 30 DAYS' },
  { value: 'all',   label: 'ALL TIME'     },
];

const ProcurementDashboard = ({ userName, userLastName = '', userRole, userId, onLogout, onBack }) => {

  // ── All hooks declared first ──────────────────────────────────
  const [deliveries, setDeliveries]             = useState([]);
  const [suppliers, setSuppliers]               = useState([]);
  const [drivers, setDrivers]                   = useState([]);
  const [products, setProducts]                 = useState([]);

  const [statusFilter, setStatusFilter]         = useState('all');
  const [searchQuery, setSearchQuery]           = useState('');
  const [dateRange, setDateRange]               = useState('month');  // default to last 30 days
  const [activeMenu, setActiveMenu]             = useState('procurement');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);

  const [isLoading, setIsLoading]               = useState(true);
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [error, setError]                       = useState('');

  // ── Fetch deliveries when date range changes ──────────────────
  const fetchDeliveries = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiGet(`/api/deliveries?range=${dateRange}`);
      setDeliveries(res.data);
    } catch (err) {
      setError('Failed to load deliveries. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  // ── Fetch reference data once on mount ───────────────────────
  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [suppliersRes, driversRes, productsRes] = await Promise.all([
          apiGet('/api/deliveries/suppliers'),
          apiGet('/api/deliveries/drivers'),
          apiGet('/api/deliveries/products'),
        ]);
        setSuppliers(suppliersRes.data);
        setDrivers(driversRes.data);
        setProducts(productsRes.data);
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    fetchReferenceData();
  }, []);

  // ── Filter deliveries client-side by search + status ─────────
  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchDriver   = d.driver_name?.toLowerCase().includes(q);
        const matchSupplier = d.supplier_name?.toLowerCase().includes(q);
        const matchDriverId = d.driver_id_number?.toLowerCase().includes(q);
        if (!matchDriver && !matchSupplier && !matchDriverId) return false;
      }
      return true;
    });
  }, [deliveries, statusFilter, searchQuery]);

  // ── Submit new delivery to backend ────────────────────────────
  const handleRecord = async (formData) => {
    setIsSubmitting(true);
    try {
      await apiPost('/api/deliveries', {
        supplierId:   formData.supplierId,
        driverId:     formData.driverId,
        deliveryDate: formData.deliveryDate,
        lineItems:    formData.lineItems.map((item) => ({
          productId:        item.productId,
          expectedWeightKg: Number(item.expectedWeightKg || 0),
          actualWeightKg:   Number(item.actualWeightKg   || 0),
          notes:            item.notes || null,
        })),
        // DO NOT send userId from the frontend
        // the backend reads it from the JWT via req.user.id
      });
      setShowDeliveryForm(false);
      fetchDeliveries(); // refresh the list
    } catch (err) {
      setError(err.message || 'Failed to record delivery.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src={logo} alt="Logo" style={{ width: '22px', height: '22px', background: '#fff', padding: '2px' }} />
            <span className="header-logo-text">LADLES OF LOVE | WMS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div>
              <p className="header-username">{userName?.toUpperCase()}</p>
              <p className="header-role">{userRole?.replace('_', ' ')}</p>
            </div>
            <button onClick={onLogout} className="btn-ghost">LOGOUT</button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="breadcrumb-bar">
          <p className="breadcrumb-text">
            LOL-NOC &gt; LOGISTICS &gt; <span>PROCUREMENT</span>
          </p>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div className="sidebar">
            <div style={{ padding: '8px' }}>
              {MENU.map((item) => (
                <button
                  key={item.id}
                  onClick={() => item.active && setActiveMenu(item.id)}
                  disabled={!item.active}
                  className={`sidebar-item${activeMenu === item.id ? ' active' : ''}`}
                >
                  <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>
                    {item.label[0]}
                  </div>
                  <span>{item.label}</span>
                  {!item.active && (
                    <span style={{ fontSize: '6px', fontWeight: 700, color: '#A4262C', marginLeft: 'auto' }}>OFF</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ padding: '8px', marginTop: 'auto' }}>
              <button onClick={onBack} className="btn-secondary" style={{ width: '100%', fontSize: '8px' }}>
                ← BACK TO TASKS
              </button>
            </div>
          </div>

          {/* Main content */}
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>

            {/* Error banner */}
            {error && (
              <div className="alert-error" style={{ marginBottom: '16px' }}>
                <p>⚠ {error.toUpperCase()}</p>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button
                onClick={() => setShowDeliveryForm(true)}
                className="btn-primary"
              >
                + RECORD NEW DELIVERY
              </button>
            </div>

            {/* Search, status filter, and date range row */}
            <div className="search-bar" style={{ flexWrap: 'wrap' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SEARCH BY SUPPLIER, DRIVER OR ID..."
                className="search-input"
                style={{ flex: 1, minWidth: '200px' }}
              />

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-select"
                style={{ width: 'auto', height: '30px' }}
              >
                <option value="all">ALL STATUSES</option>
                <option value="recorded">RECORDED</option>
                <option value="deleted">DELETED</option>
              </select>

              {/* Date range filter — fetches from backend on change */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="form-select"
                style={{ width: 'auto', height: '30px' }}
              >
                {DATE_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              <button
                onClick={fetchDeliveries}
                className="btn-primary"
                style={{ height: '30px' }}
              >
                REFRESH
              </button>
            </div>

            {/* Results count */}
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '8px', color: '#A19F9D', fontWeight: 700 }}>
                SHOWING {filtered.length} OF {deliveries.length} DELIVERIES
              </p>
            </div>

            {/* Delivery list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {isLoading ? (
                <div className="card-content" style={{ textAlign: 'center', padding: '32px' }}>
                  <p style={{ fontSize: '10px', color: '#A19F9D', fontWeight: 700 }}>
                    LOADING DELIVERIES...
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="card-content" style={{ textAlign: 'center', padding: '32px' }}>
                  <p style={{ fontSize: '10px', color: '#A19F9D', fontWeight: 700 }}>
                    NO DELIVERIES MATCH YOUR FILTERS
                  </p>
                </div>
              ) : (
                filtered.map((d) => (
                  <div
                    key={d.id}
                    className={`card-row${d.status === 'deleted' ? ' is-flagged' : ''}`}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 900, color: '#201F1E' }}>
                          {d.supplier_name}
                        </span>
                        <span className={`badge badge-${d.status}`}>
                          {d.status.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ fontSize: '8px', color: '#605E5C', margin: 0 }}>
                        {d.driver_name} · {d.delivery_date?.slice(0, 10)} · REC: {d.received_by_name}
                      </p>
                    </div>
                    <span style={{ fontSize: '8px', color: '#A19F9D', fontWeight: 700 }}>
                      #{d.id}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="footer-meta">
              [PROD-NODE-01] | LAST_SYNC: {new Date().toLocaleTimeString()} | SYS_OK
            </div>

          </div>
        </div>
      </div>

      {/* Delivery form modal */}
      {showDeliveryForm && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1000, alignItems: 'flex-start', overflowY: 'auto' }}
        >
          <div style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            padding: '20px',
          }}>
            <ProofOfDeliveryForm
              onSubmit={handleRecord}
              isSubmitting={isSubmitting}
              suppliers={suppliers}
              drivers={drivers}
              products={products}
              onCancel={() => setShowDeliveryForm(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ProcurementDashboard;
