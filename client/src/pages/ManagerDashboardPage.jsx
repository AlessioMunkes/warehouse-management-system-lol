// ─────────────────────────────────────────────────────────────
// client/src/pages/ManagerDashboardPage.jsx
//
// The manager home screen at /manager: the greeting, then the
// customisable board of widgets (features/dashboard). Which widgets
// exist, and what each one reads, lives in widgetCatalog.jsx; this
// page only says whose board it is.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import CustomisableDashboard from '../features/dashboard/components/CustomisableDashboard';
import NeedsAttention from '../features/dashboard/components/NeedsAttention';
import useAttention from '../features/dashboard/useAttention';

// The greeting reads the summary even if no widget does.
const ALWAYS = ['summary'];

const managerSummaryLine = (summary) => (summary
  ? [
      summary.pendingDispatchesToday > 0 ? `${summary.pendingDispatchesToday} pallet${summary.pendingDispatchesToday === 1 ? '' : 's'} due out today` : null,
      summary.deliveriesExpectedToday > 0 ? `${summary.deliveriesExpectedToday} ${summary.deliveriesExpectedToday === 1 ? 'delivery' : 'deliveries'} expected` : null,
    ].filter(Boolean).join(', ') || "nothing's overdue today"
  : null);

export default function ManagerDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState({});
  const summary = data.summary ?? null;
  const attention = useAttention(true);

  return (
    <ManagerLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <DashboardGreeting name={user?.firstName} summaryLine={managerSummaryLine(summary)} />
        {/* Above the widgets: what to act on before what to read. */}
        <div className="mb-6 mt-4">
          <NeedsAttention attention={attention} />
        </div>
        <CustomisableDashboard user={user} always={ALWAYS} onData={setData} />
      </div>
    </ManagerLayout>
  );
}
