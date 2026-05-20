import React from 'react';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/DeliveryFilters.jsx
//
// Search bar, status dropdown, date range dropdown, refresh.
// All filter state lives in ProcurementDashboard and is passed
// down as props — this component is purely presentational.
// ─────────────────────────────────────────────────────────────

const DATE_RANGES = [
  { value: 'today', label: 'TODAY'        },
  { value: 'week',  label: 'LAST 7 DAYS'  },
  { value: 'month', label: 'LAST 30 DAYS' },
  { value: 'all',   label: 'ALL TIME'     },
];

const DeliveryFilters = ({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  dateRange,
  setDateRange,
  onRefresh,
  totalCount,
  filteredCount,
}) => (
  <div>
    <div className="search-bar" style={{ flexWrap: 'wrap' }}>

      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="SEARCH BY SUPPLIER, DRIVER OR ID..."
        className="search-input"
        style={{ flex: 1, minWidth: '200px' }}
      />

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
        onClick={onRefresh}
        className="btn-primary"
        style={{ height: '30px' }}
      >
        REFRESH
      </button>
    </div>

    <div style={{ marginBottom: '10px' }}>
      <p style={{ fontSize: '8px', color: '#A19F9D', fontWeight: 700 }}>
        SHOWING {filteredCount} OF {totalCount} DELIVERIES
      </p>
    </div>
  </div>
);

export default DeliveryFilters;
