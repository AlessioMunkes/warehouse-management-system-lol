// ─────────────────────────────────────────────────────────────
// client/src/pages/DecantingStaffPage.jsx
//
// The staff-facing decanting task. Deliberately a NEW page rather
// than an edit to pages/DecantingPage.jsx: that page is the wide
// multi-product planner a manager uses to lay out a whole week, and
// it still has a job. This one is a phone flow for the person holding
// the sack, one product at a time.
//
// Both call the same endpoints, so neither can drift from the other's
// arithmetic.
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';
import StaffShell from '../components/layout/StaffShell';
import DecantingFlow from '../features/decanting/components/DecantingFlow';

export default function DecantingStaffPage() {
  const [stepLabel, setStepLabel] = useState('What you are working with');
  const handleCrumb = useCallback((label) => setStepLabel(label), []);

  return (
    <StaffShell crumb={`Decanting / ${stepLabel}`} meta="This week">
      <DecantingFlow onCrumbChange={handleCrumb} />
    </StaffShell>
  );
}
