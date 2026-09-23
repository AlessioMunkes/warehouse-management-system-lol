// ─────────────────────────────────────────────────────────────
// client/src/pages/FeedTheSoilPage.jsx
//
// One URL, two shapes, picked by role — the same pattern DecantingPage
// uses (see its own comment). A manager gets FeedTheSoilManagerView,
// the desktop table with the ManagerLayout chrome this page used to
// render directly. Everyone else gets StaffShell + FeedTheSoilFlow,
// the phone-first task flow every other warehouse-floor screen uses.
//
// WHY THIS CHANGED
// Feed the Soil moved here from a dialog on the Impact Calculator in
// an earlier pass, but landed in the wrong vocabulary for the staff
// who actually log kits: a ManagerLayout table with Select dropdowns
// and Card-wrapped forms, no bottom tab bar, reachable only through
// the hamburger drawer — a worker mid-task on their phone had to leave
// StaffShell entirely to log a bucket. This makes it match Receiving,
// Packing, Decanting and Dispatch instead of Supplier Directory.
//
// The worker/manager colour and typeface disparity this page was once
// piloting a fix for is now fixed in staff.css itself (its own tokens
// were revised to match the manager screens directly), so every staff
// screen picks it up — nothing left to do here.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import StaffShell from '../components/layout/StaffShell';
import FeedTheSoilManagerView from '../features/feedTheSoil/components/FeedTheSoilManagerView';
import FeedTheSoilFlow from '../features/feedTheSoil/components/FeedTheSoilFlow';
import { useAuth } from '../context/AuthContext';

const isManager = (user) => user?.role === 'manager' || user?.role === 'admin';

export default function FeedTheSoilPage() {
  const { user } = useAuth();
  const [crumb, setCrumb] = useState('Kits');

  if (isManager(user)) {
    return (
      <ManagerLayout>
        <FeedTheSoilManagerView />
      </ManagerLayout>
    );
  }

  return (
    <StaffShell crumb={`Feed the Soil / ${crumb}`}>
      <FeedTheSoilFlow onCrumbChange={setCrumb} />
    </StaffShell>
  );
}
