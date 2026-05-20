import React from 'react';
import logo from '../../assets/LOL_Logo.jpg';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/DashboardHeader.jsx
//
// Top header bar and breadcrumb strip.
// Receives user info and logout handler from ProcurementDashboard.
// ─────────────────────────────────────────────────────────────

const DashboardHeader = ({ userName, userRole, onLogout }) => (
  <>
    <div className="header-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img
          src={logo}
          alt="Logo"
          style={{ width: '22px', height: '22px', background: '#fff', padding: '2px' }}
        />
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

    <div className="breadcrumb-bar">
      <p className="breadcrumb-text">
        LOL-NOC &gt; LOGISTICS &gt; <span>PROCUREMENT</span>
      </p>
    </div>
  </>
);

export default DashboardHeader;
