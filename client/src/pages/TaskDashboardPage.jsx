// ─────────────────────────────────────────────────────────────
// client/src/pages/TaskDashboardPage.jsx
//
// The warehouse worker's dashboard. Rebuilt inside StaffShell instead
// of ManagerLayout — this page is functionally worker-only
// (navSections.js's homeForRole only ever sends a warehouse_worker
// here; a manager's real home is /manager), and the approved old
// storyboards for it use StaffShell's own visual language: the doodle
// banner footer, no sidebar. ManagerLayout's stat-tile row and
// full-width stacked cards were the wrong shell for what this screen
// was always meant to look like.
//
// Task section is a stacked list of rows on a phone, a row of
// free-standing circles from tablet width up — no connecting line
// between them either way. See staff.css's .stf-tasks for why the
// line from the original storyboard reference was tried and then
// explicitly dropped: it reads as a fixed order for the day
// (Receiving, then Packing, then Decanting, then Dispatch), which
// isn't true — a shift can be packing-only or dispatch-only. The
// "carry on where you left off" idea from that same storyboard still
// exists — it's UnfinishedWork, below.
//
// Each item's caption used to be a live count from GET
// /api/dashboard/my-work ("19 slips assigned to you"). Replaced with
// a short instruction, three words or fewer — what to do there, not a
// number that only means something once you already know what the
// task is. Nothing on this page reads that endpoint any more, so the
// fetch is gone too, not left in place unused.
//
// Feed the Soil and Benevolent Requests are text links below the
// tasks, not items in the list — same "every shift" vs "secondary"
// split StaffTabBar.jsx draws between the bottom tab bar and its
// drawer.
//
// wide on StaffShell: the standard 520px column (every task flow uses
// it) read as a small clump adrift on a bench tablet or a wide
// window — plenty of room going unused on a page that isn't a
// step-by-step flow needing a narrow, focused column in the first
// place. Same prop Decanting's week planner already uses for its own,
// different reason (a two-column form needing the space); this page
// just needs the room to not look stranded.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import UnfinishedWork from '../features/staff/components/UnfinishedWork';
import TaskNode from '../features/taskdashboard/components/TaskNode';
import { useAuth } from '../context/AuthContext';
import useCoachmark from '../features/staff/hooks/useCoachmark';
import { STAFF, PACKING } from '../routes/paths';

// What to do there, three words or fewer — see this file's own note
// above on why the live counts were dropped.
const TASKS = [
  { to: STAFF.receiving, icon: 'receiving-icon', title: 'Receiving',
    meta: 'Record deliveries' },
  { to: STAFF.donation, icon: 'donate-icon', title: 'Donation intake',
    meta: 'Log donations' },
  { to: PACKING.board, icon: 'packing-icon', title: 'Packing',
    meta: 'Pack picking slips' },
  { to: STAFF.decanting, icon: 'decanting-icon', title: 'Decanting',
    meta: 'Portion bulk stock' },
  { to: STAFF.dispatch, icon: 'dispatch-icon', title: 'Dispatch',
    meta: 'Dispatch pallets' },
  // Receipts is manager-only and deliberately absent. The item and
  // the route guard in App.jsx have to agree — a hidden item on an
  // open route is not access control, just a tidier way to lose
  // track of one.
];

export default function TaskDashboardPage() {
  const { user } = useAuth();
  const { show: showHamburgerHint, dismiss: dismissHamburgerHint } = useCoachmark('dashboard-hamburger');

  // Same 5s auto-dismiss every other Coachmark in this app already
  // has (DecantingFlow/ReceivingFlow/StaffSlipFlow's view-toggle
  // hints) — missing here was the actual bug: with no timer, dismiss
  // only ever fired on a tap, so the hint just sat on screen
  // indefinitely instead of clearing itself after a few seconds like
  // a first-visit hint should.
  useEffect(() => {
    if (!showHamburgerHint) return undefined;
    const timer = setTimeout(dismissHamburgerHint, 5000);
    return () => clearTimeout(timer);
  }, [showHamburgerHint, dismissHamburgerHint]);

  return (
    <StaffShell crumb="Home" wide>
      {showHamburgerHint ? (
        <button
          type="button"
          className="stf-coachmark stf-coachmark-fixed stf-coachmark-arrow-only"
          onClick={dismissHamburgerHint}
          aria-label="Dismiss hint: everything else is in the menu"
        >
          <span className="stf-coachmark-arrow" aria-hidden="true">&#8593;</span>
        </button>
      ) : null}

      <DashboardGreeting name={user?.firstName} />

      {/* Renders nothing when there is nothing half-done, which is
          most days. */}
      <UnfinishedWork />

      <div className="stf-tasks">
        {TASKS.map((task) => (
          <TaskNode key={task.to} {...task} />
        ))}
      </div>

      <div className="stf-dashboard-links">
        <Link to={STAFF.communityRequests}>Log a benevolent request</Link>
        <Link to={STAFF.feedTheSoil}>Log compost</Link>
      </div>
    </StaffShell>
  );
}
