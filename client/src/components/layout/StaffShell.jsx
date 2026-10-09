// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffShell.jsx
// @sentinel script-49-staff-shell-in-app
//
// The frame every warehouse-staff page sits in. It uses the same app
// layout as the rest of the system (ManagerLayout: sidebar on a desk,
// menu drawer on a phone, top bar with the bell, "reduce movement" and
// log out), then adds the staff page header and the bottom tab bar.
//
// The tab bar only shows for warehouse workers; managers and admins
// opening a floor screen already have the sidebar. Workers also get a
// small pop-up when new pallets are put on the floor, except when they
// are already on the Packing screen.
// ─────────────────────────────────────────────────────────────
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import ManagerLayout from './ManagerLayout';
import StaffTabBar from './StaffTabBar';
import { useAuth } from '../../context/AuthContext';
import OfflineBar from './OfflineBar';
import useGoBack from './useGoBack';
import useSpareSlipAlert from '../../features/staff/hooks/useSpareSlipAlert';
import usePressFlash from '../../features/staff/hooks/usePressFlash';
import useKeepAwake from '../../features/staff/hooks/useKeepAwake';
import useAccountLanguage from '../../features/staff/hooks/useAccountLanguage';
import useFloorTranslation from '../../features/staff/hooks/useFloorTranslation';
import { useT } from '../../i18n';
import { STAFF } from '../../routes/paths';

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
  // { step, total } for a numbered flow, shown as progress bars in the
  // page header. Leave out for pages without steps.
  progress,
  onBack,         // omit for a task's first screen
  backLabel = 'Back',
  // The task flows are a single phone-width column. The week planner
  // inside Decanting is a two-column form that needs the room.
  wide = false,
  actions,        // extra controls for the header row (e.g. History)
  children,
}) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { pathname } = useLocation();
  const { title, sub } = splitCrumb(crumb);

  // Only workers get the bottom tab bar; managers and admins use the
  // sidebar. Log out, "reduce movement" and the bell are in the top bar.
  const { user } = useAuth() ?? {};
  const showTabBar = !user || user.role === 'warehouse_worker';

  // Only workers are told about new pallets here; managers already get
  // picking-slip notifications through their bell.
  const isManager = user?.role === 'manager' || user?.role === 'admin';
  const { spareCount, justArrived, dismiss } = useSpareSlipAlert(!isManager);
  // The pressed button flashes, on every floor screen. The screen is
  // kept awake inside a task, not on the home screen: a tablet left on
  // the bench showing Home should still go to sleep.
  usePressFlash(true);
  // The language this worker chose follows them to this tablet.
  useAccountLanguage(user?.role === 'warehouse_worker' ? user.id : null);
  const t = useT();
  // Everything on a floor screen that is not asked for by key is put
  // into that language on the page.
  useFloorTranslation(user?.role === 'warehouse_worker');
  useKeepAwake(user?.role === 'warehouse_worker' && pathname !== STAFF.home);

  // No pop-up on the Packing screen itself; its tabs already show it.
  const onPackingPage = pathname.startsWith(STAFF.packing);

  return (
    <ManagerLayout>
      <div className={`stf-shell is-in-app${showTabBar ? '' : ' no-tabbar'}`}>
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
                      onClick={goBack}
                      aria-label={t('common.goBack')}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('common.goBackHint')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="stf-page-head-text">
                {onBack ? (
                  // The label names where "back" goes and what it leaves.
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

            {/* Step progress for numbered flows. */}
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

            {actions || meta ? (
              <div className="stf-page-head-right">
                {actions}
                {meta ? <span className="stf-crumb-meta">{meta}</span> : null}
              </div>
            ) : null}
          </header>

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

          {children}
        </main>

        {showTabBar ? <StaffTabBar packingBadge={spareCount} /> : null}
      </div>
    </ManagerLayout>
  );
}
