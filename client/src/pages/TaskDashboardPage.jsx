// ─────────────────────────────────────────────────────────────
// client/src/pages/TaskDashboardPage.jsx
//
// The warehouse worker's dashboard.
//
// It was five tiles carrying the same five words as the sidebar beside
// them. This leads with what is waiting — a sentence, then three counts
// — and describes each task rather than naming it, because "Decanting"
// tells a new volunteer nothing and "break bulk stock down into bags"
// tells them everything.
//
// The counts come from GET /api/dashboard/my-work and are advisory: a
// failed load leaves the task cards working, because picking a job must
// never depend on a stat row rendering.
//
// Feed the Soil and Benevolent Requests are text links below the main
// grid, not cards in it — same "every shift" vs "secondary" split
// StaffTabBar.jsx draws between the bottom tab bar and its drawer.
// Putting Feed the Soil in the grid as a full card (as this page used
// to) contradicted that split by giving it the same weight as the five
// tasks worked every day.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Truck, PackageCheck, PackageOpen, FlaskConical, ClipboardCheck, HandCoins, Menu } from 'lucide-react';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import UnfinishedWork from '../features/staff/components/UnfinishedWork';
import StatTile from '../features/taskdashboard/components/StatTile';
import ActionCard from '../features/taskdashboard/components/ActionCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../context/AuthContext';
import useCoachmark from '../features/staff/hooks/useCoachmark';
import { STAFF, PACKING } from '../routes/paths';
import dashboardAPI from '../services/dashboardAPI';

// One line each, in the words the floor uses. These are what turn a
// menu into a dashboard.
const TASKS = [
  { to: STAFF.receiving, icon: PackageOpen, title: 'Receiving',
    description: 'Check a delivery in against its purchase order.' },
  { to: STAFF.donation, icon: HandCoins, title: 'Donation intake',
    description: 'Log goods donated at the door.' },
  { to: PACKING.board, icon: PackageCheck, title: 'Packing',
    description: 'Pack a picking slip and flag anything short.' },
  { to: STAFF.decanting, icon: FlaskConical, title: 'Decanting',
    description: 'Break bulk stock down into bags and record the weights.' },
  { to: STAFF.dispatch, icon: ClipboardCheck, title: 'Dispatch',
    description: 'Hand a pallet over at the gate and capture the signature.' },
  // Receipts is manager-only and deliberately absent. The card and the
  // route guard in App.jsx have to agree — a hidden card on an open
  // route is not access control, just a tidier way to lose track of one.
];

// Worked far less often than the five above — reached the same way
// they're reached from every other staff screen, the hamburger drawer,
// but surfaced here too as a plain link rather than making a worker
// hunt for them on their first day.
const SECONDARY_LINKS = [
  { to: STAFF.communityRequests, label: 'Log a benevolent request' },
  { to: STAFF.feedTheSoil,       label: 'Log compost' },
];

export default function TaskDashboardPage() {
  const { user } = useAuth();
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const { show: showHamburgerHint, dismiss: dismissHamburgerHint } = useCoachmark('dashboard-hamburger');

  useEffect(() => {
    let cancelled = false;
    dashboardAPI.getMyWork()
      .then((data) => { if (!cancelled) setWork(data); })
      .catch(() => { if (!cancelled) setWork(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // The greeting says the state of the day in one line, so someone who
  // reads nothing else still knows whether there is anything waiting.
  const summaryLine = work
    ? [
        work.slipsToPack > 0 ? `${work.slipsToPack} ${work.slipsToPack === 1 ? 'slip' : 'slips'} to pack` : null,
        work.deliveriesExpected > 0 ? `${work.deliveriesExpected} ${work.deliveriesExpected === 1 ? 'delivery' : 'deliveries'} expected` : null,
        work.palletsAtGate > 0 ? `${work.palletsAtGate} at the gate` : null,
      ].filter(Boolean).join(' · ') || 'nothing waiting right now'
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Points at ManagerLayout's own hamburger trigger, top-left of
          its header (AppNavDrawer, sm:hidden) — this page can't reach
          into that header to measure it, so it's a fixed callout near
          where that button always sits at mobile widths, same rough
          approach StepPrimitives' Coachmark takes for its own anchor.
          Hidden at the sm breakpoint the sidebar takes over, same as
          the button it points to. */}
      {showHamburgerHint ? (
        <div className="fixed left-3 top-14 z-50 flex items-start gap-1.5 sm:hidden">
          <Menu className="mt-0.5 size-4 -rotate-12 text-[#2b3336]" aria-hidden="true" />
          <button
            type="button"
            onClick={dismissHamburgerHint}
            className="rounded-[4px] bg-[#2b3336] px-2.5 py-1.5 text-xs font-medium text-white shadow-md"
          >
            Everything else lives in here
          </button>
        </div>
      ) : null}

      <DashboardGreeting name={user?.firstName} summaryLine={summaryLine} />

      {/* Renders nothing when there is nothing half-done, which is
          most days. */}
      <UnfinishedWork />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : work ? (
          <>
            <StatTile icon={ClipboardList} label="Slips to pack" value={work.slipsToPack} to={PACKING.board} warn />
            <StatTile icon={Truck} label="Deliveries expected" value={work.deliveriesExpected} to={STAFF.receiving} />
            <StatTile icon={PackageCheck} label="Pallets at the gate" value={work.palletsAtGate} to={STAFF.dispatch} warn />
          </>
        ) : null}
      </div>

      <h2 className="mt-8 mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Start a task
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {TASKS.map((task) => <ActionCard key={task.to} {...task} />)}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5">
        {SECONDARY_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-[#2b3336]"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
