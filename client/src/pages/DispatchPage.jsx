// ─────────────────────────────────────────────────────────────
// client/src/pages/DispatchPage.jsx
//
// Dispatch: the gate queue, then one pallet. Two screens, phone
// first, because this is the one task that happens outdoors with one
// hand while a driver waits.
//
// The open pallet is component state rather than a URL segment: a
// deep link to a gate check is not something anyone needs, and the
// back action has to be one tap from a phone at a gate.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import GateQueue from '../features/dispatch/components/GateQueue';
import PalletCheck from '../features/dispatch/components/PalletCheck';
import { STAFF } from '../routes/paths';

export default function DispatchPage() {
  const [palletId, setPalletId] = useState(null);
  // Bumped when a collection completes, so the queue refetches and
  // the collected pallet drops out of it.
  const [queueKey, setQueueKey] = useState(0);

  const backToQueue = () => setPalletId(null);

  return (
    <StaffShell
      crumb={palletId ? 'Dispatch / this pallet' : 'Dispatch'}
      onBack={palletId ? backToQueue : undefined}
      backLabel="Gate queue"
      actions={
        palletId ? null : (
          <Link to={STAFF.dispatchHistory} className="stf-crumb-link">
            <i className="ti ti-history" aria-hidden="true" />
            <span>History</span>
          </Link>
        )
      }
    >
      {palletId ? (
        <PalletCheck
          palletId={palletId}
          onBack={backToQueue}
          onCollected={() => { setQueueKey((k) => k + 1); backToQueue(); }}
        />
      ) : (
        <GateQueue key={queueKey} onOpenPallet={setPalletId} />
      )}
    </StaffShell>
  );
}
