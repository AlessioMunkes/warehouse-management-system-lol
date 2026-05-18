import React from 'react';
import { X, Calendar, Package, FileText } from 'lucide-react';
import FormCard from '../shared/FormCard';
import FormButton from '../shared/FormButton';

const DeliveryNoteView = ({ deliveryNote, onClose }) => {
  if (!deliveryNote) return null;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTotalItems = () => {
    return deliveryNote.lineItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
  };

  return (
    <FormCard title="Delivery Note" width="550px">
      <div style={{ position: 'relative' }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-50px',
            right: '0',
            width: '32px',
            height: '32px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} color="rgba(255,255,255,0.7)" />
        </button>

        {/* Reference Number Badge */}
        <div style={{
          display: 'inline-block',
          padding: '8px 16px',
          background: 'rgba(59,130,246,0.15)',
          borderRadius: '8px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginBottom: '2px' }}>
            REFERENCE
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#3b82f6' }}>
            {deliveryNote.referenceNumber}
          </div>
        </div>

        {/* Delivery Details Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '24px',
        }}>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              Supplier
            </div>
            <div style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Package size={16} color="rgba(255,255,255,0.55)" />
              {deliveryNote.supplierName}
            </div>
          </div>

          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              Delivery Date
            </div>
            <div style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Calendar size={16} color="rgba(255,255,255,0.55)" />
              {formatDate(deliveryNote.deliveryDate)}
            </div>
          </div>

          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              Programme
            </div>
            <div style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
            }}>
              {deliveryNote.programme === 'NOC' && 'Nourish Our Children'}
              {deliveryNote.programme === 'FTS' && 'Feed the Soil'}
              {deliveryNote.programme === 'LOVE_ACTIVISM' && 'Love Activism'}
            </div>
          </div>

          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              Total Items
            </div>
            <div style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
            }}>
              {getTotalItems()} units
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.12)', marginBottom: '20px' }} />

        {/* Line Items Table */}
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <FileText size={14} />
            Items Received
          </div>

          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: '12px',
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px 8px 0 0',
            fontSize: '12px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.55)',
          }}>
            <div>ITEM</div>
            <div style={{ textAlign: 'right' }}>QUANTITY</div>
            <div style={{ textAlign: 'right' }}>UNIT</div>
          </div>

          {/* Table Rows */}
          {deliveryNote.lineItems.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                gap: '12px',
                padding: '12px',
                background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderBottom: index === deliveryNote.lineItems.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                fontSize: '14px',
                color: '#fff',
              }}
            >
              <div style={{ fontWeight: 500 }}>{item.itemName}</div>
              <div style={{ textAlign: 'right', fontWeight: 600 }}>{item.quantity}</div>
              <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.65)' }}>{item.unit}</div>
            </div>
          ))}
        </div>

        {/* Close Button */}
        <FormButton
          variant="secondary"
          onClick={onClose}
          fullWidth={true}
          style={{ marginTop: '24px' }}
        >
          Close
        </FormButton>
      </div>
    </FormCard>
  );
};

export default DeliveryNoteView;