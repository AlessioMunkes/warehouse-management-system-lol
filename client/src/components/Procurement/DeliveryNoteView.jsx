import React from 'react';
import { Calendar, Package, FileText, User, AlertTriangle, CheckCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// src/components/Procurement/DeliveryNoteView.jsx
//
// No inline styles — all classes come from src/css/index.css
// Receives the full delivery object from GET /api/deliveries/:id
// ─────────────────────────────────────────────────────────────

const formatDate = (dateString) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const MetaBlock = ({ icon: Icon, label, value }) => (
  <div className="note-meta-block">
    <p>{label}</p>
    <div className="note-meta-value">
      {Icon && <Icon size={12} />}
      <span>{value || '—'}</span>
    </div>
  </div>
);

const DeliveryNoteView = ({ delivery, onClose }) => {
  if (!delivery) return null;

  const totalExpected  = delivery.items?.reduce((s, i) => s + Number(i.expected_quantity || 0), 0) ?? 0;
  const totalActual    = delivery.items?.reduce((s, i) => s + Number(i.actual_quantity   || 0), 0) ?? 0;
  const flaggedCount   = delivery.items?.filter((i) => i.is_flagged).length ?? 0;
  const hasFlagged     = flaggedCount > 0;

  const SUMMARY_STATS = [
    { label: 'TOTAL ITEMS',   value: delivery.items?.length ?? 0 },
    { label: 'EXPECTED UNITS', value: totalExpected },
    { label: 'ACTUAL UNITS',   value: totalActual   },
    { label: 'DISCREPANCIES',  value: flaggedCount  },
  ];

  return (
    <div className="form-modal-wide">

      {/* Header */}
      <div className="form-modal-header">
        <div>
          <h2 className="form-modal-title">DELIVERY NOTE</h2>
          <p className="form-modal-subtitle">
            LOL-NOC · PROCUREMENT · RECORD #{delivery.id}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasFlagged ? (
            <div className="note-status-chip is-discrepancy">
              <AlertTriangle size={10} />
              DISCREPANCY
            </div>
          ) : (
            <div className="note-status-chip is-ok">
              <CheckCircle size={10} />
              MATCHED
            </div>
          )}
          <button onClick={onClose} className="btn-ghost">✕ CLOSE</button>
        </div>
      </div>

      {/* Meta grid */}
      <div className="note-meta-grid">
        <MetaBlock icon={Package}  label="SUPPLIER"      value={delivery.supplier_name}    />
        <MetaBlock icon={User}     label="DRIVER"        value={delivery.driver_name}       />
        <MetaBlock icon={Calendar} label="DELIVERY DATE" value={formatDate(delivery.delivery_date)} />
        <MetaBlock icon={User}     label="RECEIVED BY"   value={delivery.received_by_name}  />
      </div>

      {/* Summary stats */}
      <div className="note-summary-row">
        {SUMMARY_STATS.map((stat) => (
          <div key={stat.label} className="note-summary-stat">
            <p className="note-summary-label">{stat.label}</p>
            <p className="note-summary-value">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Line items */}
      <div>
        <div className="note-section-bar">
          <FileText size={12} />
          <p>LINE ITEMS</p>
        </div>

        {/* Column headers */}
        <div className="note-line-cols">
          <span>PRODUCT</span>
          <span className="note-line-col-center">EXP QTY</span>
          <span className="note-line-col-center">ACT QTY</span>
          <span className="note-line-col-center">EXP KG</span>
          <span className="note-line-col-center">ACT KG</span>
          <span className="note-line-col-center">STATUS</span>
        </div>

        {/* Rows */}
        {delivery.items?.length ? (
          delivery.items.map((item, i) => {
            const qtyMismatch = Number(item.actual_quantity) !== Number(item.expected_quantity);
            const wgtMismatch = Number(item.weight_discrepancy_kg) !== 0;

            return (
              <div
                key={item.id ?? i}
                className={`note-line-row${item.is_flagged ? ' is-flagged' : ''}`}
              >
                <span className="note-line-product">{item.product_name}</span>

                <span className="note-line-qty">{item.expected_quantity}</span>

                <span className={`note-line-qty-actual${qtyMismatch ? ' is-discrepancy' : ''}`}>
                  {item.actual_quantity}
                </span>

                <span className="note-line-weight">
                  {item.expected_weight_kg ? `${item.expected_weight_kg}kg` : '—'}
                </span>

                <span className={`note-line-weight${wgtMismatch ? ' is-discrepancy' : ''}`}>
                  {item.actual_weight_kg ? `${item.actual_weight_kg}kg` : '—'}
                </span>

                <div className="note-line-col-center">
                  {item.is_flagged
                    ? <span className="badge-flagged">FLAGGED</span>
                    : <span className="badge-ok">OK</span>
                  }
                </div>
              </div>
            );
          })
        ) : (
          <div className="card-content" style={{ textAlign: 'center' }}>
            <p className="note-summary-label">NO LINE ITEMS FOUND</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="note-footer">
        <p className="note-footer-meta">
          RECORDED: {formatDate(delivery.created_at)} | STATUS: {delivery.status?.toUpperCase()}
        </p>
        <button onClick={onClose} className="btn-primary">
          CLOSE
        </button>
      </div>
    </div>
  );
};

export default DeliveryNoteView;
