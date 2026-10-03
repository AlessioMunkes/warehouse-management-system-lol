// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffCommunityRequestsPage.jsx
//
// Benevolent Requests on the warehouse floor: log a phoned-in or
// walk-in request. Warehouse staff only; managers work the same
// requests on CommunityRequestsPage.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import StaffShell from '../components/layout/StaffShell';
import CommunityRequestFlow from '../features/communityRequests/components/CommunityRequestFlow';

export default function StaffCommunityRequestsPage() {
  const [crumb, setCrumb] = useState('Log a request');
  return (
    <StaffShell crumb={`Benevolent Requests / ${crumb}`}>
      <CommunityRequestFlow onCrumbChange={setCrumb} />
    </StaffShell>
  );
}
