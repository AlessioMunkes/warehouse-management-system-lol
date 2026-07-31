// client/src/features/packing/components/CompleteSlipBar.jsx
import { useState } from 'react';


export default function CompleteSlipBar({ slip, pendingCount, onComplete }) {
  const [palletRef, setPalletRef] = useState(slip.pallet_ref || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [shortfalls, setShortfalls] = useState(null);

  const canComplete = pendingCount === 0 && slip.status !== 'complete';

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await onComplete({ palletRef: palletRef || undefined });
      if (result?.shortfalls?.length) setShortfalls(result.shortfalls);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (slip.status === 'complete') {
    return (
      <div className="complete-bar complete-bar--done">
        Pallet complete{slip.pallet_ref ? ` · Ref ${slip.pallet_ref}` : ''}.
      </div>
    );
  }

  return (
    <div className="complete-bar">
      {!canComplete && (
        <p className="complete-bar__hint">
          {pendingCount} item(s) still need to be confirmed or flagged before this pallet can be closed.
        </p>
      )}

      {shortfalls && (
        <div className="complete-bar__shortfall">
          Stock shortfall recorded for {shortfalls.length} item(s) — a manager will need to reconcile this.
        </div>
      )}

      {error && <div className="complete-bar__error">{error}</div>}

      <div className="complete-bar__row">
        <input
          type="text"
          placeholder="Pallet reference (optional)"
          value={palletRef}
          onChange={(e) => setPalletRef(e.target.value)}
        />
        <button
          className="btn btn--primary"
          disabled={!canComplete || submitting}
          onClick={handleComplete}
        >
          {submitting ? 'Closing pallet…' : 'Complete pallet'}
        </button>
      </div>
    </div>
  );
}