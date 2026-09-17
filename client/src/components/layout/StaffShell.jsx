// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffShell.jsx
// @sentinel script-49-staff-shell-in-app
//
// The frame every warehouse-staff task page sits in.
//
// Script 49: the floor flows now sit INSIDE the same app shell as the
// dashboard, manager and admin screens (ManagerLayout — sidebar on a
// desk, hamburger drawer on a phone, one top bar). Before this they
// had their own dark app bar, a breadcrumb strip and a doodle footer,
// so opening Receiving from the worker's dashboard felt like leaving
// the app.
//
// What moved where — nothing was dropped:
//   dark app bar drawer        → ManagerLayout's drawer / sidebar
//   "Less movement"            → the eye button in the top bar. Same
//                                storage key (stf_reduced_motion) and
//                                the same <html data-stf-motion>
//                                attribute, so every staff.css rule
//                                that honours it still does.
//   "Log out"                  → the top bar's log-out button
//   signed-in name             → the top bar
//   back arrow (history -1)    → the arrow beside the page title
//   crumb / onBack / actions / meta → the page header below
//   bottom tab bar             → kept, phones only (below sm). At sm+
//                                the sidebar lists the same four tasks.
//
// The props are unchanged, so none of the seven pages that render
// this needed editing. ManagerLayout is idempotent, so a page that is
// already inside a shell gets a passthrough rather than a second one.
// ─────────────────────────────────────────────────────────────
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import ManagerLayout from '../../features/taskdashboard/components/ManagerLayout';
import StaffTabBar from './StaffTabBar';
import OfflineBar from './OfflineBar';

// 'Packing / Little Stars ECD' → title 'Packing', sub 'Little Stars ECD'.
// The first segment is the task, which is what the new-style pages put
// in their heading; the rest is where in the task you are.
const splitCrumb = (crumb) => {
  const parts = String(crumb ?? '').split(' / ');
  return { title: parts[0], sub: parts.slice(1).join(' / ') };
};

export default function StaffShell({
  crumb,          // 'Receiving' or 'Packing / Little Stars ECD'
  meta,           // right-hand line: a date, a reference, a count
  onBack,         // omit for a task's first screen
  backLabel = 'Back',
  // The task flows are a single phone-width column. The week planner
  // inside Decanting is a two-column form that needs the room.
  wide = false,
  actions,        // extra controls for the header row (e.g. History)
  children,
}) {
  const navigate = useNavigate();
  const { title, sub } = splitCrumb(crumb);

  return (
    <ManagerLayout>
      <div className="stf-shell is-in-app">
        <OfflineBar />

        <main className={wide ? 'stf-main is-wide' : 'stf-main'}>
          <header className="stf-page-head">
            <div className="stf-page-head-left">
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

              <div className="stf-page-head-text">
                {onBack ? (
                  // Same accessible name as the old crumb button, so the
                  // in-flow "back" still announces where it goes and
                  // what it leaves.
                  <button
                    type="button"
                    className="stf-page-back"
                    onClick={onBack}
                    aria-label={`${backLabel} · ${crumb}`}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    <span>{backLabel}</span>
                  </button>
                ) : null}
                <p className="stf-page-title">{title}</p>
                {sub ? <p className="stf-page-sub">{sub}</p> : null}
              </div>
            </div>

            {actions || meta ? (
              <div className="stf-page-head-right">
                {actions}
                {meta ? <span className="stf-crumb-meta">{meta}</span> : null}
              </div>
            ) : null}
          </header>

          {children}
        </main>

        <StaffTabBar />
      </div>
    </ManagerLayout>
  );
}
