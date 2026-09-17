// ─────────────────────────────────────────────────────────────
// client/src/pages/ReceivingPage.jsx
//
// Routed page for the staff receiving task. Thin on purpose: the
// shell owns the chrome, ReceivingFlow owns the four steps, and this
// file only passes the step label into the crumb line.
//
// The "See past deliveries" link lives here, passed as StaffShell's
// `actions`, rather than inside ReceivingFlow's own scrolling content
// — the crumb bar is the one part of this screen that's always
// visible, regardless of scroll position or whether the Form dialog
// is currently open over everything else. It replaces the plain date
// StaffShell would otherwise show as `meta`; today's date carries far
// less weight than a reachable link back to what's already been
// received.
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import ReceivingFlow from '../features/procurement/components/ReceivingFlow';
import { STAFF } from '../routes/paths';

export default function ReceivingPage() {
  const [stepLabel, setStepLabel] = useState('Which delivery');

  // Memoised so the flow's effect does not refire on every render.
  const handleCrumb = useCallback((label) => setStepLabel(label), []);

  return (
    <StaffShell
      crumb={`Receiving / ${stepLabel}`}
      actions={
        <Link to={STAFF.deliveries} className="stf-crumb-link">
          <i className="ti ti-history" aria-hidden="true" />
          <span>History</span>
        </Link>
      }
    >
      <ReceivingFlow onCrumbChange={handleCrumb} />
    </StaffShell>
  );
}