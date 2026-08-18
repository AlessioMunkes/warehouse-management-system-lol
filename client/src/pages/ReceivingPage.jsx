// ─────────────────────────────────────────────────────────────
// client/src/pages/ReceivingPage.jsx
//
// Routed page for the staff receiving task. Thin on purpose: the
// shell owns the chrome, ReceivingFlow owns the four steps, and this
// file only passes the step label into the crumb line.
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';
import StaffShell from '../components/layout/StaffShell';
import ReceivingFlow from '../features/procurement/components/ReceivingFlow';

const today = () =>
  new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

export default function ReceivingPage() {
  const [stepLabel, setStepLabel] = useState('Which delivery');

  // Memoised so the flow's effect does not refire on every render.
  const handleCrumb = useCallback((label) => setStepLabel(label), []);

  return (
    <StaffShell crumb={`Receiving / ${stepLabel}`} meta={today()}>
      <ReceivingFlow onCrumbChange={handleCrumb} />
    </StaffShell>
  );
}