// ─────────────────────────────────────────────────────────────
// client/src/features/assistant/components/AssistantLauncher.jsx
//
// The floating button, bottom right, on every signed-in screen.
//
// MOUNTED ONCE, IN ProtectedRoute. That is the single point every
// authenticated route passes through — both shells and the four
// staff flows that use neither — so one mount covers the whole app
// and it is automatically absent from the landing page and the login
// screen, which are outside any ProtectedRoute.
//
// ── The bottom-right corner is crowded ──────────────────────
// Three things want it: the staff tab bar, the toast stack, and now
// this. They have to agree, and until now they did not.
//
// --stf-tabbar-h looks like the answer and is not: staff.css
// declares it on the staff shell's own element, so only descendants
// of that shell can read it. This button and the toast stack are
// both rendered ABOVE the shell, so for them it has always resolved
// to the 0px fallback — which is why toasts have been sitting on top
// of the tab bar on the staff screens.
//
// So the tab bar is MEASURED, on every route change, and this
// component publishes one number on :root for everyone below it:
//
//   --wms-assistant-h  how much of the bottom-right corner is spoken
//                      for — tab bar, this button, and the gaps.
//                      The toast stack adds it to its own offset, so
//                      an Undo is never hidden behind the help
//                      button, and it clears the tab bar for free.
//
// ── The rest of the numbers ─────────────────────────────────
//   • z-40: over the page and the tab bar (z-20), under toasts
//     (z-100), under the panel it opens (z-60).
//   • 3.5rem square — comfortably past the 44px minimum in ACC-06,
//     because the person tapping it may be wearing gloves or may not
//     have steady hands, and it is the control they reach for when
//     something has already gone wrong.
// ─────────────────────────────────────────────────────────────
import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { matchScreen } from '../screenPaths';
import AssistantPanel from './AssistantPanel';

const GAP   = 16;  // between the button and whatever is under it
const SIZE  = 56;  // the button itself — 3.5rem, past the ACC-06 minimum
const CLEAR = 12;  // between the button and whatever is above it

export default function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const screen = matchScreen(pathname);

  // Measured per route — the staff flows have a tab bar, the manager
  // and admin screens do not, and the same button serves both.
  //
  // Written straight to CSS custom properties rather than into React
  // state. A measurement that only ever feeds a style does not need
  // a render to deliver it, and routing it through state would mean
  // a second render on every navigation to move a button that has
  // not moved. A layout effect also lands it before paint, so there
  // is no visible hop.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const bar  = document.querySelector('.stf-tabbar');
    const inset = bar ? Math.round(bar.getBoundingClientRect().height) : 0;

    root.style.setProperty('--wms-launcher-bottom', `${inset + GAP}px`);
    root.style.setProperty('--wms-assistant-h', `${inset + GAP + SIZE + CLEAR}px`);

    return () => {
      root.style.removeProperty('--wms-launcher-bottom');
      root.style.removeProperty('--wms-assistant-h');
    };
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // One stable name, state carried by aria-expanded — not a
        // label that flips to "Close help", which is also the name
        // of the button inside the panel. Two controls with one name
        // is a screen reader reading the same thing twice with no
        // way to tell them apart.
        aria-label="Help"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={[
          'fixed right-4 z-40 flex size-14 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg',
          'hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // Only brightness transitions. The motion setting turns
          // animation off app-wide, and a button that still grows
          // under your finger is what ACC-08 is about.
          'transition-[filter] duration-150',
        ].join(' ')}
        style={{ bottom: 'var(--wms-launcher-bottom, 1rem)' }}
      >
        <LifeBuoy className="size-6" aria-hidden="true" />
      </button>

      {/* Mounted only while open, so the catalog is not fetched and
          no transcript is held for the many people who never open
          it. Closing it therefore also clears the conversation,
          which is the behaviour you want from a help panel: it opens
          on the screen you are on, not on what you asked yesterday. */}
      {open && (
        <AssistantPanel open={open} onOpenChange={setOpen} screen={screen} />
      )}
    </>
  );
}
