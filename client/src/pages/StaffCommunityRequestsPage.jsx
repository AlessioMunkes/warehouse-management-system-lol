// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffCommunityRequestsPage.jsx
//
// Benevolent Requests on the warehouse floor: log a phoned-in or
// walk-in request, and pack the ones a manager has approved (claim,
// fetch the items, confirm what went out). Warehouse staff only;
// managers approve, assign and decline on CommunityRequestsPage.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import StaffShell from '../components/layout/StaffShell';
import CommunityRequestFlow from '../features/communityRequests/CommunityRequestFlow';

export default function StaffCommunityRequestsPage() {
  const [crumb, setCrumb] = useState('Log a request');
  return (
    <StaffShell crumb={`Benevolent Requests / ${crumb}`}>
      <CommunityRequestFlow onCrumbChange={setCrumb} />
    </StaffShell>
  );
}
