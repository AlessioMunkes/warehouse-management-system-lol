// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffShell.jsx
//
// The frame every warehouse-staff page sits in: dark app bar,
// breadcrumb line, the single content column, the tab bar, and the
// doodle banner footer.
//
// Why this exists rather than reusing features/*/components/PageHeader:
// that header is a desktop bar with a back arrow, an avatar, a status
// pill and a logout modal — four things competing for the top of a
// 390px screen. The staff pages need two: who is logged in, and the
// way back out of a slip. Everything else moved to the tab bar.
//
// PageHeader is untouched, so the manager screens keep it.
// ─────────────────────────────────────────────────────────────
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '../../context/AuthContext';
import useReducedMotion from '../../features/staff/hooks/useReducedMotion';
import useSpareSlipAlert from '../../features/staff/hooks/useSpareSlipAlert';
import StaffTabBar from './StaffTabBar';
import StaffNotificationBell from './StaffNotificationBell';
import OfflineBar from './OfflineBar';
import { AppNavDrawer } from '../../features/taskdashboard/components/AppNav';
import { STAFF } from '../../routes/paths';

// Both live in client/public/, the same convention the landing page
// uses for /images/BatchesLogo.png and /icons/*.svg — plain URLs, no
// Vite import needed for what is effectively brand furniture.
const LOGO_URL   = '/images/BatchesLogo.png';
const BANNER_URL = '/images/banner-doodles.png';

export default function StaffShell({
  crumb,          // 'Receiving' or 'Packing / Little Stars ECD'
  meta,           // right-hand line: a date, a reference, a count
  // { step, total } — a numbered step flow's progress, shown in the
  // crumb row (see .stf-crumb-progress). Was its own StepRail block
  // rendered inside the card by each flow; moved up here so the
  // breadcrumb, progress and History share one row instead of three
  // stacked ones. Omit entirely for a page with no steps.
  progress,
  onBack,         // omit for a task's first screen
  backLabel = 'Back',
  // The task flows are a single phone-width column. The week planner
  // inside Decanting is a two-column form that needs the room, so it
  // asks for the wide column rather than getting its own chrome —
  // one app bar, one tab bar, everywhere.
  wide = false,
  actions,        // extra controls for the crumb row (e.g. a mode switch)
  children,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { reduced, toggle } = useReducedMotion();

  // Managers already get told about picking-slip activity through
  // NotificationBell on their own layout — this is the floor-facing
  // half, so it only polls for roles that actually work a pallet.
  const isManager = user?.role === 'manager' || user?.role === 'admin';
  const { spareCount, justArrived, dismiss } = useSpareSlipAlert(!isManager);
  // Already on Packing, so the Spare tab there is telling this worker
  // the same thing directly — a toast on top of that would just be
  // announcing what's already on screen.
  const onPackingPage = pathname.startsWith(STAFF.packing);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="stf-shell">
      <header className="stf-appbar">
        <div className="stf-appbar-left">
          {/* Everything the role can open. The tab bar below switches
              between the four tasks; this reaches the rest without
              backing out to /noc. No breakpoint on it — this shell has
              no sidebar at any width. */}
          <AppNavDrawer />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(-1)}
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Go back to previous page</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="stf-appbar-brand">
            <img className="stf-appbar-logo" src={LOGO_URL} alt="" aria-hidden="true" />
            <span className="stf-appbar-name">Batches</span>
            <span className="stf-appbar-prog">
              {user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Nourish Our Children'}
            </span>
          </div>
        </div>

        <div className="stf-appbar-actions">
          {/* The worker's own notification history — see its own file
              header for why this is a separate component from the
              manager's NotificationBell rather than a shared one with
              a role check inside it. */}
          <StaffNotificationBell />
          {/* ACC-08. Labelled with what it does, not "reduce motion" —
              the staff reading it are not describing an animation
              system, they just want the screen to stop moving. */}
          <button
            type="button"
            className="stf-appbar-btn"
            aria-pressed={reduced}
            onClick={toggle}
          >
            Less movement
          </button>
          <button type="button" className="stf-appbar-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="stf-crumb">
        {onBack ? (
          <button type="button" className="stf-crumb-back" onClick={onBack}>
            {backLabel} · {crumb}
          </button>
        ) : (
          <span>{crumb}</span>
        )}
        {progress ? (
          <div
            className="stf-crumb-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={progress.total}
            aria-valuenow={progress.step}
            aria-label={`Step ${progress.step} of ${progress.total}`}
          >
            <span className="stf-crumb-progress-bars">
              {Array.from({ length: progress.total }, (_, i) => (
                <span
                  key={i}
                  className={`stf-crumb-progress-bar${i < progress.step ? ' is-done' : ''}`}
                />
              ))}
            </span>
            <span className="stf-crumb-progress-label">Step {progress.step} of {progress.total}</span>
          </div>
        ) : null}
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {actions}
          {meta ? <span className="stf-crumb-meta">{meta}</span> : null}
        </span>
      </div>

      <OfflineBar />

      {justArrived.length > 0 && !onPackingPage ? (
        <div className="stf-activity-toast" role="status">
          <span className="stf-activity-toast-text">
            {justArrived.length} new pallet{justArrived.length > 1 ? 's' : ''} assigned to the floor.
          </span>
          <button
            type="button"
            className="stf-activity-toast-btn"
            onClick={() => { dismiss(); navigate(STAFF.packing); }}
          >
            View
          </button>
          <button
            type="button"
            className="stf-activity-toast-dismiss"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            &times;
          </button>
        </div>
      ) : null}

      <main className={wide ? 'stf-main is-wide' : 'stf-main'}>{children}</main>

      <StaffTabBar packingBadge={spareCount} />
      <div
        className="stf-footer"
        aria-hidden="true"
        style={{ backgroundImage: `url(${BANNER_URL})` }}
      />
    </div>
  );
}
