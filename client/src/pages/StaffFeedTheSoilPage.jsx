// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffFeedTheSoilPage.jsx
//
// Feed the Soil on the warehouse floor: assign a kit, weigh compost in.
// Warehouse staff only; managers see every kit on FeedTheSoilPage.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import StaffShell from '../components/layout/StaffShell';
import FeedTheSoilFlow from '../features/feedTheSoil/FeedTheSoilFlow';

export default function StaffFeedTheSoilPage() {
  const [crumb, setCrumb] = useState('Kits');
  // Kits are the screen; the compost records are its history, reached
  // from the header like Receiving's and Dispatch's.
  const [history, setHistory] = useState(false);
  return (
    <StaffShell
      crumb={`Feed the Soil / ${crumb}`}
      // History goes back to the kits from the header, the way the
      // other histories go back to their own task.
      onBack={history ? () => setHistory(false) : undefined}
      actions={history ? null : (
        <button type="button" className="stf-crumb-link" onClick={() => setHistory(true)}>
          <i className="ti ti-history" aria-hidden="true" />
          <span>History</span>
        </button>
      )}
    >
      <FeedTheSoilFlow onCrumbChange={setCrumb} history={history} onHistoryChange={setHistory} />
    </StaffShell>
  );
}
