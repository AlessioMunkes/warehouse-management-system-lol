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
import { useEffect, useState } from 'react';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import FlaggedItemsTab from '../features/donationManagement/FlaggedItemsTab';
import { isUnresolvedFlag } from '../features/donationManagement/flagStatus';
import ReconciliationTab from '../features/donationManagement/ReconciliationTab';
import donationManagementAPI, { RECONCILIATION_STATUSES } from '@/services/donationManagementAPI';

const TABS = [
  {
    id: 'awaiting-classification',
    label: 'Pending Product Review',
    description: 'These donations have entered products that need a manager decision.',
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation',
    description: "These donations need to be checked because something doesn't match.",
  },
  {
    id: 'processing-failed',
    label: 'Processing Failed',
    description: "These donations couldn't be completed because of a system problem. Try processing them again.",
  },
];

const RECONCILIATION_ONLY_STATUSES = ['commit_incomplete'];
const COMMIT_FAILED_STATUSES = ['commit_failed'];

export default function DonationManagementPage() {
  const [tab, setTab] = useState('awaiting-classification');
  const [counts, setCounts] = useState({
    'awaiting-classification': 0,
    reconciliation: 0,
    'processing-failed': 0,
  });

  useEffect(() => {
    let cancelled = false;

    const loadCounts = async () => {
      try {
        const [flags, reconciliationRows] = await Promise.all([
          donationManagementAPI.getFlaggedItems(),
          donationManagementAPI.getPendingDonations(RECONCILIATION_STATUSES),
        ]);

        if (cancelled) return;

        setCounts({
          'awaiting-classification': flags.filter(isUnresolvedFlag).length,
          reconciliation: reconciliationRows.filter((row) => row.status === 'commit_incomplete').length,
          'processing-failed': reconciliationRows.filter((row) => row.status === 'commit_failed').length,
        });
      } catch {
        if (!cancelled) {
          setCounts({
            'awaiting-classification': 0,
            reconciliation: 0,
            'processing-failed': 0,
          });
        }
      }
    };

    void loadCounts();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeTab = TABS.find((item) => item.id === tab) || TABS[0];

  return (
    <PageShell>
      <PageHeader
        title="Classification queue"
        description="Review and classify donations that need a decision."
      />

      {/* The counts live on the tabs, red while anything waits; the
          three summary cards above them said the same thing again. */}
      <ViewTabs
        className="mt-5"
        label="Classification queue sections"
        value={tab}
        onChange={setTab}
        tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: counts[t.id], alert: true }))}
      />

      <p className="mt-4 text-sm text-muted-foreground">{activeTab.description}</p>

      {tab === 'awaiting-classification' ? (
        <FlaggedItemsTab />
      ) : tab === 'reconciliation' ? (
        <ReconciliationTab
          statuses={RECONCILIATION_ONLY_STATUSES}
          summaryText={`${counts.reconciliation} donation${counts.reconciliation === 1 ? '' : 's'} need checking.`}
          emptyText="Nothing needs checking right now."
          actionLabel="Resolve"
        />
      ) : (
        <ReconciliationTab
          statuses={COMMIT_FAILED_STATUSES}
          summaryText={`${counts['processing-failed']} donation${counts['processing-failed'] === 1 ? '' : 's'} couldn't be completed.`}
          emptyText="No processing failures need retrying right now."
          actionLabel="Retry"
        />
      )}
    </PageShell>
  );
}
