// ─────────────────────────────────────────────────────────────
// client/src/pages/TaskDashboardPage.jsx
// @sentinel script-51-task-dashboard-simple
// @sentinel script-52-illustrated-icons
//
// The warehouse worker's home screen: the tasks they can start, and
// nothing else.
//
// It used to open with three counts from GET /api/dashboard/my-work
// above the task cards. On the floor that is a row to read past on the
// way to the one button you came for, so script 51 drops it — the
// counts still live on the screens that can act on them (the packing
// board, the gate queue). The fetch goes with it, so this page renders
// with no network call and cannot show a spinner or a failed row
// between someone and their job.
//
// The tiles are STAFF_TABS from the bottom bar, in the same order with
// the same icons, so the four tasks look the same wherever they are
// shown. Home is dropped — it is this screen. Donation intake is added
// on the end for staff, and is hidden from managers and admins, who
// reach it from their own sidebar.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HandCoins } from 'lucide-react';
import { STAFF_TABS } from '../components/layout/staffTasks';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import UnfinishedWork from '../features/staff/components/UnfinishedWork';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '../context/AuthContext';
import { STAFF } from '../routes/paths';

// One line each, in the words the floor uses — "Decanting" tells a new
// volunteer nothing, "break bulk stock down into bags" tells them
// everything.
const BLURBS = {
  Receiving: 'Check a delivery in against its purchase order.',
  Packing:   'Pack a picking slip and flag anything short.',
  Decanting: 'Break bulk stock down into bags and record the weights.',
  Dispatch:  'Hand a pallet over at the gate and capture the signature.',
};

const TASKS = [
  ...STAFF_TABS
    .filter((tab) => tab.to !== STAFF.home)
    .map((tab) => ({
      to: tab.to, icon: tab.icon, image: tab.image,
      title: tab.label, description: BLURBS[tab.label],
    })),
  { to: STAFF.donation, icon: HandCoins, image: '/icons/donate-icon.svg',
    title: 'Donation intake', description: 'Log goods donated at the door.' },
  // Receipts is manager-only and deliberately absent. The tile and the
  // route guard in App.jsx have to agree — a hidden tile on an open
  // route is not access control, just a tidier way to lose track of one.
];

function TaskTile({ to, icon: Icon, image, title, description }) {
  // Same drawing as the tab bar, same fallback: a missing file shows
  // the glyph rather than an empty box.
  const [broken, setBroken] = useState(false);
  return (
    <Link to={to} className="block h-full">
      <Card className="h-full transition-colors hover:border-brand hover:bg-canvas">
        <CardContent className="flex h-full flex-col items-start gap-3 p-5">
          <div className="stf-tile-icon rounded-[10px] bg-surface-2 p-2 text-brand">
            {image && !broken ? (
              <img src={image} alt="" aria-hidden="true" className="size-12 object-contain"
                   onError={() => setBroken(true)} />
            ) : (
              <Icon className="size-8" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-ink">{title}</p>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function TaskDashboardPage() {
  const { user } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  const visibleTasks = TASKS.filter((task) =>
    task.to !== STAFF.donation || (role !== 'manager' && role !== 'admin')
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <DashboardGreeting name={user?.firstName} summaryLine="Pick a task to get started" />

      {/* Renders nothing when there is nothing half-done, which is
          most days. */}
      <UnfinishedWork />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTasks.map((task) => <TaskTile key={task.to} {...task} />)}
      </div>
    </div>
  );
}
