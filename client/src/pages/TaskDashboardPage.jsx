// ─────────────────────────────────────────────────────────────
// client/src/pages/TaskDashboardPage.jsx
//
// The warehouse worker's dashboard. Rebuilt inside StaffShell instead
// of ManagerLayout — this page is functionally worker-only
// (navSections.js's homeForRole only ever sends a warehouse_worker
// here; a manager's real home is /manager), and the approved old
// storyboards for it use StaffShell's own visual language: the doodle
// banner footer, rounded square task tiles, no sidebar. ManagerLayout's
// stat-tile row and full-width stacked cards were the wrong shell for
// what this screen was always meant to look like.
//
// Squares over a stacked list, and over a fixed 4-step "journey"
// (the other old storyboard candidate, re-deliberated against the
// app as it stands today): a worker doesn't move through Receiving →
// Packing → Decanting → Dispatch in that order every day — a shift
// might be packing-only, or dispatch-only — so a "you are here, step
// 2 of 4" framing would claim an order that doesn't exist, and
// Donation Intake (one of the five daily tasks, same weight as the
// other four) has nowhere to sit in a 4-step line at all. Five
// independent squares, each free-standing, matches how the floor
// actually works. The "carry on where you left off" idea from that
// same storyboard still exists — it's UnfinishedWork, below.
//
// The counts come from GET /api/dashboard/my-work and are advisory: a
// failed load leaves the task cards working, because picking a job
// must never depend on a stat row rendering. They're folded into each
// tile's own caption now rather than a separate stat row up top — a
// count only means something next to the task it belongs to.
//
// Feed the Soil and Benevolent Requests are text links below the
// grid, not tiles in it — same "every shift" vs "secondary" split
// StaffTabBar.jsx draws between the bottom tab bar and its drawer.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import UnfinishedWork from '../features/staff/components/UnfinishedWork';
import TaskTile from '../features/taskdashboard/components/TaskTile';
import { useAuth } from '../context/AuthContext';
import useCoachmark from '../features/staff/hooks/useCoachmark';
import { STAFF, PACKING } from '../routes/paths';
import dashboardAPI from '../services/dashboardAPI';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Monday of the current week, in words — what decanting.service.js's
// weekOf means, said the way a worker glancing at a card would read
// it. Duplicated rather than imported from DecantingFlow.jsx, same
// reasoning as that file's own note on why its date helpers aren't
// shared across features.
const weekOfCaption = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return `Week of ${now.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`;
};

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
        work.slipsToPack > 0 ? `${plural(work.slipsToPack, 'slip')} to pack` : null,
        work.deliveriesExpected > 0 ? `${plural(work.deliveriesExpected, 'delivery')} expected` : null,
        work.palletsAtGate > 0 ? `${work.palletsAtGate} at the gate` : null,
      ].filter(Boolean).join(' · ') || 'nothing waiting right now'
    : null;

  const TASKS = [
    {
      to: STAFF.receiving, icon: 'receiving-icon', title: 'Receiving',
      meta: work ? `${plural(work.deliveriesExpected, 'delivery')} expected` : undefined,
    },
    {
      to: STAFF.donation, icon: 'donate-icon', title: 'Donation intake',
      meta: undefined,
    },
    {
      to: PACKING.board, icon: 'packing-icon', title: 'Packing',
      meta: work ? `${plural(work.slipsToPack, 'slip')} assigned to you` : undefined,
    },
    {
      to: STAFF.decanting, icon: 'decanting-icon', title: 'Decanting',
      meta: weekOfCaption(),
    },
    {
      to: STAFF.dispatch, icon: 'dispatch-icon', title: 'Dispatch',
      meta: work ? `${work.palletsAtGate} at the gate` : undefined,
    },
    // Receipts is manager-only and deliberately absent. The tile and
    // the route guard in App.jsx have to agree — a hidden tile on an
    // open route is not access control, just a tidier way to lose
    // track of one.
  ];

  return (
    <StaffShell crumb="Home">
      {showHamburgerHint ? (
        <div className="stf-coachmark stf-coachmark-fixed" role="status">
          <span className="stf-coachmark-arrow" aria-hidden="true">&#8593;</span>
          <button type="button" className="stf-coachmark-body" onClick={dismissHamburgerHint}>
            Everything else lives in here
          </button>
        </div>
      ) : null}

      <DashboardGreeting name={user?.firstName} summaryLine={summaryLine} />

      {/* Renders nothing when there is nothing half-done, which is
          most days. */}
      <UnfinishedWork />

      <div className="stf-task-grid">
        {TASKS.map((task) => (
          <TaskTile key={task.to} {...task} loading={loading} />
        ))}
      </div>

      <div className="stf-dashboard-links">
        <Link to={STAFF.communityRequests}>Log a benevolent request</Link>
        <Link to={STAFF.feedTheSoil}>Log compost</Link>
      </div>
    </StaffShell>
  );
}
