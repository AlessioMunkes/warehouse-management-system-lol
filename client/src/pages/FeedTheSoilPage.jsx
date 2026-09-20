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
// fts-theme (PILOT).
// The worker view still looked like a different product from the
// manager one even after the shell fix above — both sides already
// share one brand palette, but staff.css applies it far more
// literally (warm khaki backgrounds, a bold display face) than the
// manager screens do. feedTheSoilTheme.css overrides only this page's
// own .stf-shell custom properties to close that gap, without
// touching staff.css or any other staff screen — see that file's own
// header for what it does and does not change. This is a pilot: if
// it lands well, the same overrides move into staff.css's own tokens
// so Receiving/Packing/Decanting/Dispatch/Donation Intake pick it up
// too; if not, deleting this import and the wrapping div reverts only
// this page.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import StaffShell from '../components/layout/StaffShell';
import FeedTheSoilManagerView from '../features/feedTheSoil/components/FeedTheSoilManagerView';
import FeedTheSoilFlow from '../features/feedTheSoil/components/FeedTheSoilFlow';
import { useAuth } from '../context/AuthContext';
import '../features/feedTheSoil/feedTheSoilTheme.css';

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
    <div className="fts-theme">
      <StaffShell crumb={`Feed the Soil / ${crumb}`}>
        <FeedTheSoilFlow onCrumbChange={setCrumb} />
      </StaffShell>
    </div>
  );
}
