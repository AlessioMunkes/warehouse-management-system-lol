// client/src/features/packing/components/ItemRow.jsx
import { useState } from 'react';
import StatusBadge from './StatusBadge'
export default function ItemRow({ item, locked, canEdit, onConfirm, onFlag }) {
  const [mode, setMode] = useState(null); // null | 'confirm' | 'flag'
  const [qty, setQty] = useState(item.required_quantity);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rowError, setRowError] = useState(null);

  const isDecided = item.status === 'confirmed' || item.status === 'flagged';

  const reset = () => { setMode(null); setReason(''); setRowError(null); };

  const submitConfirm = async () => {
    setSubmitting(true);
    setRowError(null);
    try {
      await onConfirm(item.id, Number(qty));
      reset();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitFlag = async () => {
    if (!reason.trim()) { setRowError('A reason is required.'); return; }
    setSubmitting(true);
    setRowError(null);
    try {
      await onFlag(item.id, reason.trim(), qty === '' ? undefined : Number(qty));
      reset();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`item-row ${isDecided ? 'item-row--decided' : ''}`}>
      <div className="item-row__main">
        <div className="item-row__name">{item.product_name}</div>
        <div className="item-row__meta">
          {item.sku} · Required: {item.required_quantity} {item.unit}
        </div>
      </div>

      <div className="item-row__status">
        <StatusBadge status={item.status} />
        {item.status === 'confirmed' && (
          <span className="item-row__packed">{item.packed_quantity} {item.unit} packed</span>
        )}
        {item.status === 'flagged' && item.flag_reason && (
          <span className="item-row__reason">"{item.flag_reason}"</span>
        )}
      </div>

      {canEdit && !locked && !isDecided && (
        <div className="item-row__actions">
          {mode === null && (
            <>
              <button className="btn btn--confirm" onClick={() => setMode('confirm')}>Confirm</button>
              <button className="btn btn--flag" onClick={() => setMode('flag')}>Flag</button>
            </>
          )}

          {mode === 'confirm' && (
            <div className="item-row__form">
              <input
                type="number"
                min="0.01"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
              />
              <span className="item-row__unit">{item.unit}</span>
              <button className="btn btn--confirm" disabled={submitting} onClick={submitConfirm}>
                {submitting ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn--ghost" onClick={reset}>Cancel</button>
            </div>
          )}

          {mode === 'flag' && (
            <div className="item-row__form item-row__form--flag">
              <textarea
                placeholder="What's wrong? e.g. short by 4 units, damaged packaging…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                autoFocus
              />
              <div className="item-row__form-row">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Qty actually packed (optional)"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                <button className="btn btn--flag" disabled={submitting} onClick={submitFlag}>
                  {submitting ? 'Saving…' : 'Flag item'}
                </button>
                <button className="btn btn--ghost" onClick={reset}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {rowError && <div className="item-row__error">{rowError}</div>}
    </div>
  );
}