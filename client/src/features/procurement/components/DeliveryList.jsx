import React from 'react';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/DeliveryList.jsx
//
// Renders the list of delivery cards.
// Handles loading state, empty state, and the VIEW PDF button.
// All data and handlers come from ProcurementDashboard via props.
// ─────────────────────────────────────────────────────────────

const DeliveryCard = ({ delivery, onViewPdf, loadingPdf }) => (
  <div className={`card-row${delivery.status === 'deleted' ? ' is-flagged' : ''}`}>
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '16px', fontWeight: 900, color: '#201F1E' }}>
          {delivery.supplier_name}
        </span>
        <span className={`badge badge-${delivery.status}`}>
          {delivery.status.toUpperCase()}
        </span>
      </div>
      <p style={{ fontSize: '14px', color: '#605E5C', margin: 0 }}>
        {delivery.driver_name} · {delivery.delivery_date?.slice(0, 10)} · REC: {delivery.received_by_name}
      </p>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '14px', color: '#A19F9D', fontWeight: 700 }}>
        #{delivery.id}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onViewPdf(delivery.id); }}
        className="btn-view-pdf"
        disabled={loadingPdf}
      >
        {loadingPdf ? '...' : 'VIEW PDF'}
      </button>
    </div>
  </div>
);

const DeliveryList = ({ deliveries, isLoading, onViewPdf, loadingPdf }) => {
  if (isLoading) {
    return (
      <div className="card-content" style={{ textAlign: 'center', padding: '32px' }}>
        <p style={{ fontSize: '10px', color: '#A19F9D', fontWeight: 700 }}>
          LOADING DELIVERIES...
        </p>
      </div>
    );
  }

  if (!deliveries.length) {
    return (
      <div className="card-content" style={{ textAlign: 'center', padding: '32px' }}>
        <p style={{ fontSize: '10px', color: '#A19F9D', fontWeight: 700 }}>
          NO DELIVERIES MATCH YOUR FILTERS
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {deliveries.map((d) => (
        <DeliveryCard
          key={d.id}
          delivery={d}
          onViewPdf={onViewPdf}
          loadingPdf={loadingPdf}
        />
      ))}
    </div>
  );
};

export default DeliveryList;
