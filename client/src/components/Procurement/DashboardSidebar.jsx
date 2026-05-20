import React from 'react';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/DashboardSidebar.jsx
//
// Left sidebar with menu items and back button.
// activeMenu and setActiveMenu controlled by ProcurementDashboard.
// ─────────────────────────────────────────────────────────────

const MENU = [
  { id: 'procurement', label: 'PROCUREMENT',  active: true  },
  { id: 'ecdDispatch', label: 'ECD DISPATCH', active: false },
  { id: 'decanting',   label: 'DECANTING',    active: false },
  { id: 'packing',     label: 'PACKING',      active: false },
  { id: 'system',      label: 'SYSTEM CONFIG',active: false },
];

const DashboardSidebar = ({ activeMenu, setActiveMenu, onBack }) => (
  <div className="sidebar">
    <div style={{ padding: '8px' }}>
      {MENU.map((item) => (
        <button
          key={item.id}
          onClick={() => item.active && setActiveMenu(item.id)}
          disabled={!item.active}
          className={`sidebar-item${activeMenu === item.id ? ' active' : ''}`}
        >
          <div style={{
            width: '20px', height: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px',
          }}>
            {item.label[0]}
          </div>
          <span>{item.label}</span>
          {!item.active && (
            <span style={{ fontSize: '6px', fontWeight: 700, color: '#A4262C', marginLeft: 'auto' }}>
              OFF
            </span>
          )}
        </button>
      ))}
    </div>
    <div style={{ padding: '8px', marginTop: 'auto' }}>
      <button
        onClick={onBack}
        className="btn-secondary"
        style={{ width: '100%', fontSize: '8px' }}
      >
        ← BACK TO TASKS
      </button>
    </div>
  </div>
);

export default DashboardSidebar;
