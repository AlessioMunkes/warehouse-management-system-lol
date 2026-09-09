// ─────────────────────────────────────────────────────────────
// client/src/pages/DonationManagementPage.jsx
// Route: /admin/donation-management
//
// Admin page for the donation-management workflow. All three tabs are
// now live: Flagged Items, Pending Donations, and Reconciliation.
//
// The tab strip is hand-rolled border-b buttons, copied verbatim from
// SupplierDirectoryPage — there is no Tabs primitive in components/ui and
// .stf-tab is StaffShell's bottom bar, which is a different thing.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import FlaggedItemsTab from '../features/donationManagement/components/FlaggedItemsTab';
import PendingDonationsTab from '../features/donationManagement/components/PendingDonationsTab';
import ReconciliationTab from '../features/donationManagement/components/ReconciliationTab';

const TABS = [
  { id: 'flagged', label: 'Flagged Items' },
  { id: 'pending', label: 'Pending Donations' },
  { id: 'reconciliation', label: 'Reconciliation' },
];

export default function DonationManagementPage() {
  const [tab, setTab] = useState('flagged');

  return (
    <div className="min-h-screen bg-[#f8f5f2] text-[#2b3336] font-['Montserrat',sans-serif]">
      <TopNavbar reducedMovement={false} onToggleMovement={() => {}} />

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Donation Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review flagged items and reconcile donation intake.
        </p>

        <div className="mt-5 flex gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'border-b-2 border-foreground px-4 py-2 text-sm font-medium'
                  : 'px-4 py-2 text-sm text-muted-foreground'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'flagged' ? (
          <FlaggedItemsTab />
        ) : tab === 'pending' ? (
          <PendingDonationsTab onReconcileTab={() => setTab('reconciliation')} />
        ) : (
          <ReconciliationTab />
        )}
      </main>
    </div>
  );
}