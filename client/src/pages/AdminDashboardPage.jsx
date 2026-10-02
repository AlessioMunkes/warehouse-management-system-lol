// ─────────────────────────────────────────────────────────────
// client/src/pages/AdminDashboardPage.jsx
//
// The admin landing screen. LoginPage sends every admin here.
//
// Grouped by what an admin is answerable for rather than listed flat:
// accounts and volunteers, the master data every other module reads,
// and where donations end up. It is deliberately NOT the manager
// dashboard — beneficiaries, picking slips and purchase orders are the
// manager's day, and burying donation workflows among them made the
// remaining admin screens easy to overlook.
//
// D6/Q2: the Donation Management badge is a single DEDUPLICATED count —
// unlinked flags plus pending donations needing attention, with
// intake-linked flags NOT counted twice, so one donation blocked by
// three flagged items counts once. See
// donationManagementAPI.getAttentionCounts().
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import { timeGreeting } from '../features/dashboard/timeGreeting';
import CustomisableDashboard from '../features/dashboard/components/CustomisableDashboard';
import { useAuth } from '@/context/AuthContext';

// The admin home screen: the same customisable board as the manager's,
// with the admin widgets (users, donation queue, shortcuts) on by
// default. See features/dashboard/widgetCatalog.jsx.
// What the greeting line reads, whatever widgets are showing.
const ALWAYS = ['donations', 's18a'];

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState({});

  // The admin's own to-do: the classification queue and certificates
  // ready to issue — not the manager's stock figures.
  const loaded = data.donations !== undefined || data.s18a !== undefined;
  const queued = data.s18a?.queued ?? 0;
  const summaryLine = loaded
    ? [
        data.donations > 0 ? `${data.donations} in the donation queue` : null,
        queued > 0 ? `${queued} certificate${queued === 1 ? '' : 's'} to issue` : null,
      ].filter(Boolean).join(' · ') || 'nothing needs your attention'
    : null;

  return (
    <PageShell>
      <PageHeader
        className="mb-6"
        title={`${timeGreeting()}${user?.firstName ? `, ${user.firstName}` : ''}`}
        description={summaryLine ? `Today: ${summaryLine}.` : 'What would you like to work on today?'}
      />
      <CustomisableDashboard user={user} always={ALWAYS} onData={setData} />
    </PageShell>
  );
}
