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
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { ClipboardList, Truck, PackageCheck, PackageOpen, FlaskConical, ClipboardCheck, HandCoins } from 'lucide-react';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import UnfinishedWork from '../features/staff/components/UnfinishedWork';
import StatTile from '../features/taskdashboard/components/StatTile';
import ActionCard from '../features/taskdashboard/components/ActionCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../context/AuthContext';
import { STAFF, PACKING } from '../routes/paths';
import dashboardAPI from '../services/dashboardAPI';

// One line each, in the words the floor uses. These are what turn a
// menu into a dashboard.
const TASKS = [
  { to: STAFF.receiving, icon: PackageOpen, title: 'Receiving',
    description: 'Check a delivery in against its purchase order.' },
  { to: PACKING.board, icon: PackageCheck, title: 'Packing',
    description: 'Pack a picking slip and flag anything short.' },
  { to: STAFF.decanting, icon: FlaskConical, title: 'Decanting',
    description: 'Break bulk stock down into bags and record the weights.' },
  { to: STAFF.dispatch, icon: ClipboardCheck, title: 'Dispatch',
    description: 'Hand a pallet over at the gate and capture the signature.' },
  { to: STAFF.donation, icon: HandCoins, title: 'Donation intake',
    description: 'Log goods donated at the door.' },
  // Receipts is manager-only and deliberately absent. The card and the
  // route guard in App.jsx have to agree — a hidden card on an open
  // route is not access control, just a tidier way to lose track of one.
];

export default function TaskDashboardPage() {
  const { user } = useAuth();
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);

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
    </div>
  );
}
