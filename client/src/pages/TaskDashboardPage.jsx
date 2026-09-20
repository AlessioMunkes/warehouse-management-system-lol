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
// Task section is the round, connected-line path from the other old
// storyboard, explicitly asked for over the square tile grid this
// replaced. See TaskPathNode.jsx for how it avoids that grid's own
// original objection to a "journey" layout — a fake done/current/
// future state implying an order the floor doesn't actually follow —
// while keeping the round, connected shape. The "carry on where you
// left off" idea from that same storyboard still exists — it's
// UnfinishedWork, below.
//
// Each node's caption used to be a live count from GET
// /api/dashboard/my-work ("19 slips assigned to you"). Replaced with
// a plain instruction — "Pack a picking slip" — on request: what to
// do there, not a number that only means something once you already
// know what the task is. Nothing on this page reads that endpoint any
// more, so the fetch is gone too, not left in place unused.
//
// Feed the Soil and Benevolent Requests are text links below the
// path, not nodes on it — same "every shift" vs "secondary" split
// StaffTabBar.jsx draws between the bottom tab bar and its drawer.
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
import TaskPathNode from '../features/taskdashboard/components/TaskPathNode';
import { useAuth } from '../context/AuthContext';
import useCoachmark from '../features/staff/hooks/useCoachmark';
import { STAFF, PACKING } from '../routes/paths';

// What to do there, not a number — see this file's own note above on
// why the live counts were dropped.
const TASKS = [
  { to: STAFF.receiving, icon: 'receiving-icon', title: 'Receiving',
    meta: 'Record incoming delivery' },
  { to: STAFF.donation, icon: 'donate-icon', title: 'Donation intake',
    meta: 'Log a donation' },
  { to: PACKING.board, icon: 'packing-icon', title: 'Packing',
    meta: 'Pack a picking slip' },
  { to: STAFF.decanting, icon: 'decanting-icon', title: 'Decanting',
    meta: 'Weigh and bag stock' },
  { to: STAFF.dispatch, icon: 'dispatch-icon', title: 'Dispatch',
    meta: 'Dispatch a pallet' },
  // Receipts is manager-only and deliberately absent. The tile and
  // the route guard in App.jsx have to agree — a hidden tile on an
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

      <div className="stf-path-track">
        {TASKS.map((task) => (
          <TaskPathNode key={task.to} {...task} />
        ))}
      </div>

      <div className="stf-dashboard-links">
        <Link to={STAFF.communityRequests}>Log a benevolent request</Link>
        <Link to={STAFF.feedTheSoil}>Log compost</Link>
      </div>
    </StaffShell>
  );
}
