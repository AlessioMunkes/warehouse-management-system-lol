import React from 'react';
import { X } from 'lucide-react';

const LineItemRow = ({ item, onChange, onRemove, stockItems, error }) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 100px 32px',
      gap: '8px',
      marginBottom: '12px',
      alignItems: 'start',
    }}>
      {/* Stock Item Dropdown */}
      <div>
        <select
          value={item.stockItemId}
          onChange={(e) => onChange({ ...item, stockItemId: e.target.value })}
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: '10px',
            border: `1px solid ${error?.stockItemId ? '#ef4444' : 'rgba(255,255,255,0.18)'}`,
            background: 'rgba(255,255,255,0.08)',
            color: item.stockItemId ? '#fff' : 'rgba(255,255,255,0.45)',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer',
            appearance: 'none',
          }}
        >
          <option value="" style={{ background: '#3d0a0a' }}>Select item...</option>
          {stockItems.map(stock => (
            <option key={stock.id} value={stock.id} style={{ background: '#3d0a0a', color: '#fff' }}>
              {stock.name} ({stock.unit})
            </option>
          ))}
        </select>
        {error?.stockItemId && (
          <p style={{ color: '#fca5a5', fontSize: '11px', marginTop: '2px' }}>
            {error.stockItemId}
          </p>
        )}
      </div>

      {/* Quantity Input */}
      <div>
        <input
          type="number"
          value={item.quantity}
          onChange={(e) => onChange({ ...item, quantity: e.target.value })}
          placeholder="Qty"
          min="0"
          step="0.1"
          style={{
            width: '100%',
            padding: '11px 8px',
            borderRadius: '10px',
            border: `1px solid ${error?.quantity ? '#ef4444' : 'rgba(255,255,255,0.18)'}`,
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            fontSize: '14px',
            outline: 'none',
            textAlign: 'center',
          }}
        />
        {error?.quantity && (
          <p style={{ color: '#fca5a5', fontSize: '11px', marginTop: '2px' }}>
            {error.quantity}
          </p>
        )}
      </div>

      {/* Remove Button */}
      <button
        onClick={onRemove}
        type="button"
        style={{
          width: '32px',
          height: '38px',
          background: 'rgba(220,38,38,0.2)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.35)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.2)'; }}
      >
        <X size={16} color="#fca5a5" />
      </button>
    </div>
  );
};

export default LineItemRow;