// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffFeedTheSoilPage.jsx
//
// Feed the Soil on the warehouse floor: assign a kit, weigh compost in.
// Warehouse staff only; managers see every kit on FeedTheSoilPage.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import StaffShell from '../components/layout/StaffShell';
import FeedTheSoilFlow from '../features/feedTheSoil/components/FeedTheSoilFlow';

export default function StaffFeedTheSoilPage() {
  // The flow reports where it is and, on a screen with a parent, how to go
  // back to it ("‹ Kits"). The arrow at the top left still goes back a page.
  const [nav, setNav] = useState({ crumb: 'Kits', back: null, backLabel: null });
  return (
    <StaffShell
      crumb={`Feed the Soil / ${nav.crumb}`}
      onBack={nav.back ?? undefined}
      backLabel={nav.backLabel ?? undefined}
    >
      <FeedTheSoilFlow onCrumbChange={setNav} />
    </StaffShell>
  );
}
