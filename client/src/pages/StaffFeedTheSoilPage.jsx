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
  return (
    <StaffShell crumb={`Feed the Soil / ${crumb}`}>
      <FeedTheSoilFlow onCrumbChange={setCrumb} />
    </StaffShell>
  );
}
