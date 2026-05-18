import React, { useState, useMemo } from 'react';  // useMemo was missing
import ProofOfDeliveryForm from './components/Procurement/ProofOfDeliveryForm';
import logo from './assets/LOL Logo.jpg';

const MENU = [
  { id: 'procurement', label: 'PROCUREMENT',  active: true  },
  { id: 'ecdDispatch', label: 'ECD DISPATCH', active: false },
  { id: 'decanting',   label: 'DECANTING',    active: false },
  { id: 'packing',     label: 'PACKING',      active: false },
  { id: 'system',      label: 'SYSTEM CONFIG',active: false },
];

const INITIAL_DELIVERIES = [
  {
    id: 'DEL-001', supplier: 'Freshmark', driver: 'John Mokoena',
    driverID: 'SA8821033', vehicle: 'CA 123-456', date: '2026-05-12',
    noteNumber: 'FRM-20240512',
    items: [
      { name: 'Carrots',  noteQty: 50,  actualQty: 50,  unit: 'kg' },
      { name: 'Spinach',  noteQty: 20,  actualQty: 17,  unit: 'kg' },
      { name: 'Onions',   noteQty: 30,  actualQty: 30,  unit: 'kg' },
    ],
    status: 'recorded', deletedReason: null,
  },
  {
    id: 'DEL-002', supplier: 'Cape Fresh', driver: 'Sipho Dube',
    driverID: 'SA7734521', vehicle: 'WC 789-012', date: '2026-05-05',
    noteNumber: 'CF-20240505',
    items: [
      { name: 'Potatoes', noteQty: 100, actualQty: 100, unit: 'kg' },
      { name: 'Cabbage',  noteQty: 40,  actualQty: 38,  unit: 'kg' },
    ],
    status: 'deleted', deletedReason: 'Supplier delivered wrong produce.',
  },
  {
    id: 'DEL-003', supplier: 'Organic Roots', driver: 'Thabo Nkosi',
    driverID: 'SA9912847', vehicle: 'GP 345-678', date: '2026-05-19',
    noteNumber: 'OR-20240519',
    items: [
      { name: 'Beetroot',  noteQty: 25, actualQty: 25, unit: 'kg' },
      { name: 'Butternut', noteQty: 60, actualQty: 60, unit: 'kg' },
    ],
    status: 'recorded', deletedReason: null,
  },
];

const Dashboard = ({ userName, userLastName = '', userRole, selectedTask, onLogout, onBack }) => {

  // ── ALL HOOKS MUST BE DECLARED FIRST — before any early returns ──
  const [deliveries, setDeliveries]       = useState(INITIAL_DELIVERIES);
  const [statusFilter, setStatusFilter]   = useState('all');
  const [searchQuery, setSearchQuery]     = useState('');
  const [dateFilter, setDateFilter]       = useState('');
  const [activeMenu, setActiveMenu]       = useState('procurement');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);

  // Mock data — replace these with useEffect API calls when ready
  const [stockItems] = useState([
    { id: 1, name: 'Carrots',   unit: 'kg' },
    { id: 2, name: 'Spinach',   unit: 'kg' },
    { id: 3, name: 'Onions',    unit: 'kg' },
    { id: 4, name: 'Potatoes',  unit: 'kg' },
    { id: 5, name: 'Cabbage',   unit: 'kg' },
  ]);

  const [suppliers] = useState([
    { id: 1, name: 'Freshmark'     },
    { id: 2, name: 'Cape Fresh'    },
    { id: 3, name: 'Organic Roots' },
  ]);

  const [drivers] = useState([
    { id: 1, name: 'John Mokoena', supplierId: 1 },
    { id: 2, name: 'Sipho Dube',   supplierId: 2 },
    { id: 3, name: 'Thabo Nkosi',  supplierId: 3 },
  ]);

  // Filtered delivery list — recalculates only when dependencies change
  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (statusFilter === 'recorded' && d.status !== 'recorded') return false;
      if (statusFilter === 'deleted'  && d.status !== 'deleted')  return false;
      if (dateFilter && d.date !== dateFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!d.driver.toLowerCase().includes(q) && !d.driverID.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [deliveries, statusFilter, searchQuery, dateFilter]);

  // ── Now safe to have early return — all hooks are above ──────────
  if (selectedTask !== 'procurement') {
    return (
      <div className="page-light" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card-content" style={{ textAlign: 'center', padding: '48px' }}>
          <h2 className="section-title">COMING SOON</h2>
          <p style={{ fontSize: '11px', color: '#605E5C', marginBottom: '20px' }}>
            {selectedTask} is under development.
          </p>
          <button onClick={onBack} className="btn-primary">← GO BACK</button>
        </div>
      </div>
    );
  }

  // ── Handlers ─────────────────────────────────────────────────────

  const handleRecord = (formData) => {
    const newId = `DEL-${String(deliveries.length + 1).padStart(3, '0')}`;
    const newDelivery = {
      id:           newId,
      supplier:     formData.supplierName,
      driver:       formData.driverName,
      driverID:     formData.driverIdNumber || 'N/A',
      vehicle:      formData.vehicleReg     || 'N/A',
      date:         formData.deliveryDate,
      noteNumber:   formData.referenceNumber,
      items: formData.lineItems.map((item) => {
        const stock = stockItems.find((s) => s.id == item.stockItemId);
        return {
          name:      stock ? stock.name : 'Unknown',
          noteQty:   Number(item.quantity),
          actualQty: Number(item.quantity),
          unit:      stock ? stock.unit : 'units',
        };
      }),
      status:        'recorded',
      deletedReason: null,
    };
    setDeliveries((prev) => [newDelivery, ...prev]);
    setShowDeliveryForm(false);
  };

  // ── Render ────────────────────────────────────────────────────────
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

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button onClick={() => setShowDeliveryForm(true)} className="btn-primary">
                RECORD NEW DELIVERY
              </button>
              <button className="btn-secondary">VIEW EXISTING DELIVERIES</button>
              <button className="btn-secondary">VIEW CURRENT DELIVERIES</button>
            </div>

            {/* Search and filter row */}
            <div className="search-bar">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SEARCH BY DRIVER OR ID..."
                className="search-input"
              />
              <button className="btn-primary" style={{ height: '30px' }}>FIND</button>
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
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="form-input"
                style={{ width: 'auto', height: '30px' }}
              />
            </div>

            {/* Delivery list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filtered.length === 0 ? (
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
                        <span style={{ fontSize: '10px', fontWeight: 900, color: '#201F1E' }}>{d.supplier}</span>
                        <span className={`badge badge-${d.status}`}>{d.status.toUpperCase()}</span>
                      </div>
                      <p style={{ fontSize: '8px', color: '#605E5C', margin: 0 }}>
                        {d.driver} · {d.vehicle} · {d.date}
                      </p>
                    </div>
                    <span style={{ fontSize: '8px', color: '#A19F9D', fontWeight: 700 }}>{d.noteNumber}</span>
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
        <div className="modal-overlay" style={{ zIndex: 1000, alignItems: 'flex-start', overflowY: 'auto' }}>
          <div style={{ maxHeight: '90vh', overflowY: 'auto', width: '100%', display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <ProofOfDeliveryForm
              onSubmit={handleRecord}
              stockItems={stockItems}
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

export default Dashboard;
