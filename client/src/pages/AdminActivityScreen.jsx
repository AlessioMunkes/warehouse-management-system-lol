// ─────────────────────────────────────────────────────────────
// client/src/pages/AdminActivityScreen.jsx
//
// The admin landing screen. LoginPage sends every admin here.
//
// Grouped by what an admin is answerable for rather than listed flat:
// accounts and volunteers, the master data every other module reads,
// and where donations end up. It is deliberately NOT the manager
// dashboard — beneficiaries, picking slips and purchase orders are the
// manager's day, and burying the four donation screens among them was
// how they went unnoticed in the first place.
//
// D6/Q2: the Donation Management badge is a single DEDUPLICATED count —
// unlinked flags plus pending donations needing attention, with
// intake-linked flags NOT counted twice, so one donation blocked by
// three flagged items counts once. See
// donationManagementAPI.getAttentionCounts().
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  Users2, HandHeart, Package, Truck, Gift, Tags, Route, AlertTriangle, ScrollText,
} from 'lucide-react';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import StatTile from '../features/taskdashboard/components/StatTile';
import ActionCard from '../features/taskdashboard/components/ActionCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import donationManagementAPI from '../services/donationManagementAPI';
import dashboardAPI from '../services/dashboardAPI';
import { getUsers } from '../services/userAPI';
import { ADMIN, VOLUNTEERS } from '../routes/paths';

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : '');

export default function AdminActivityScreen() {
  const { user } = useAuth();

  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [donationMgmtCount, setDonationMgmtCount] = useState(null);
  const [summary, setSummary] = useState(null);
  const [userCount, setUserCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadPendingReviewCount = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/donations/admin/pending-classifications?countOnly=true`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (isActive) setPendingReviewCount(Number(payload.count || 0));
      } catch {
        if (isActive) setPendingReviewCount(0);
      }
    };

    const loadDonationMgmtCount = async () => {
      try {
        const { total } = await donationManagementAPI.getAttentionCounts();
        if (isActive) setDonationMgmtCount(total);
      } catch {
        // Advisory — a failed load leaves the card without a badge
        // rather than blocking the screen.
        if (isActive) setDonationMgmtCount(null);
      }
    };

    void loadPendingReviewCount();
    void loadDonationMgmtCount();

    // Catalog health, which is master data an admin owns.
    dashboardAPI.getDashboardSummary()
      .then((data) => { if (isActive) setSummary(data); })
      .catch(() => { if (isActive) setSummary(null); })
      .finally(() => { if (isActive) setLoading(false); });

    // No count endpoint for users, and one route is not worth adding for
    // a number this small — the directory the admin is about to open
    // returns the rows anyway.
    getUsers()
      .then((rows) => { if (isActive) setUserCount(Array.isArray(rows) ? rows.length : null); })
      .catch(() => { if (isActive) setUserCount(null); });

    return () => { isActive = false; };
  }, []);

  const summaryLine = summary
    ? [
        summary.lowStockCount > 0 ? `${summary.lowStockCount} low on stock` : null,
        donationMgmtCount > 0 ? `${donationMgmtCount} in the donation queue` : null,
        pendingReviewCount > 0 ? `${pendingReviewCount} awaiting classification` : null,
      ].filter(Boolean).join(' · ') || 'nothing needs your attention'
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <DashboardGreeting name={user?.firstName} summaryLine={summaryLine} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : (
          <>
            <StatTile icon={Users2} label="User accounts" value={userCount ?? '—'} to={ADMIN.users} />
            <StatTile icon={Package} label="Active products" value={summary?.activeProductCount ?? '—'} to={ADMIN.products} />
            <StatTile icon={AlertTriangle} label="Low stock items" value={summary?.lowStockCount ?? 0} to="/noc/inventory" warn />
            <StatTile icon={Gift} label="Donation queue" value={donationMgmtCount ?? 0} to={ADMIN.donationManagement} warn />
          </>
        )}
      </div>

      <h2 className="mt-8 mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        People
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          to={ADMIN.users} icon={Users2} title="Users"
          description="Create accounts, set roles, deactivate someone who has left."
        />
        <ActionCard
          to={VOLUNTEERS.events} icon={HandHeart} title="Volunteer Management"
          description="Love Activism events, the spaces they run in, and who checked in."
        />
      </div>

      <h2 className="mt-8 mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Master data
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          to={ADMIN.products} icon={Package} title="Products"
          description="The item catalog every delivery, slip and donation references."
        />
        <ActionCard
          to={ADMIN.suppliers} icon={Truck} title="Manage Suppliers"
          description="Who the warehouse buys from, and the terms on each agreement."
        />
      </div>

      <h2 className="mt-8 mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Donations
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          to={ADMIN.donationManagement} icon={Gift} title="Classification Queue"
          description="Pending donations and flagged items waiting on a decision."
          badge={donationMgmtCount > 0 ? `Needs attention (${donationMgmtCount})` : null}
        />
        <ActionCard
          to={ADMIN.section18aManagement} icon={ScrollText} title="Section 18A Management"
          description="Review donations that qualify for tax certificates."
        />
        <ActionCard
          to={ADMIN.donationClassification} icon={Tags} title="Donation Classification"
          description="Set the category a product counts as when it is donated."
          badge={pendingReviewCount > 0 ? `Needs Review (${pendingReviewCount})` : null}
        />
        <ActionCard
          to={ADMIN.categoryRouting} icon={Route} title="Category Routing Rules"
          description="Where each donation category is stored and what happens to it."
        />
        <ActionCard
          to={ADMIN.evaluateRouting} icon={Route} title="Explain Donation Routing"
          description="Trace why a specific item routed the way it did."
        />
      </div>
    </div>
  );
}
