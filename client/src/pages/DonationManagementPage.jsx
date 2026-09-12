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
import { AlertTriangle, ClipboardList, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import FlaggedItemsTab from '../features/donationManagement/components/FlaggedItemsTab';
import ReconciliationTab from '../features/donationManagement/components/ReconciliationTab';
import donationManagementAPI, { RECONCILIATION_STATUSES } from '@/services/donationManagementAPI';

const TABS = [
  {
    id: 'awaiting-classification',
    label: 'Awaiting Classification',
    description: 'These donations need a category before they can be processed.',
    icon: ClipboardList,
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation',
    description: "These donations need to be checked because something doesn't match.",
    icon: AlertTriangle,
  },
  {
    id: 'processing-failed',
    label: 'Processing Failed',
    description: "These donations couldn't be completed because of a system problem. Try processing them again.",
    icon: RotateCcw,
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
          'awaiting-classification': flags.length,
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
    <div className="min-h-screen bg-[#f8f5f2] text-[#2b3336] font-['Montserrat',sans-serif]">

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Classification Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review donations that need a decision before the warehouse can finish them.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-[#2b3336]">Awaiting Classification</p>
              <p className="mt-1 text-xs text-muted-foreground">These donations need a category before they can be processed.</p>
              <Badge variant="outline" className="mt-3 inline-flex rounded-[6px] px-2 py-0 text-[11px]">
                {counts['awaiting-classification']}
              </Badge>
            </CardContent>
          </Card>
          <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-[#2b3336]">Reconciliation</p>
              <p className="mt-1 text-xs text-muted-foreground">These donations need to be checked because something doesn't match.</p>
              <Badge variant="outline" className="mt-3 inline-flex rounded-[6px] px-2 py-0 text-[11px]">
                {counts.reconciliation}
              </Badge>
            </CardContent>
          </Card>
          <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-[#2b3336]">Processing Failed</p>
              <p className="mt-1 text-xs text-muted-foreground">These donations couldn't be completed because of a system problem. Try processing them again.</p>
              <Badge variant="outline" className="mt-3 inline-flex rounded-[6px] px-2 py-0 text-[11px]">
                {counts['processing-failed']}
              </Badge>
            </CardContent>
          </Card>
        </div>
        <div className="mt-5 flex flex-wrap gap-1 border-b" role="tablist" aria-label="Classification queue sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-label={`${t.label} ${counts[t.id]}`}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'flex items-center gap-2 border-b-2 border-foreground px-4 py-2 text-sm font-medium'
                  : 'flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground'
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              <Badge variant="outline" className="ml-1 rounded-[6px] px-2 py-0 text-[11px]">
                {counts[t.id]}
              </Badge>
            </button>
          ))}
        </div>

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
      </main>
    </div>
  );
}
