// ─────────────────────────────────────────────────────────────
// client/src/components/ui/detail-panel.jsx
//
// One record, opened from its row, in a panel down the right-hand side.
//
//   open     — whether it is showing
//   onClose  — closes it (Escape and the × both call this)
//   eyebrow  — small line above the title (a SKU, a reference number)
//   title    — what this record is
//   badges   — status pills under the title
//   actions  — Buttons pinned to the bottom, so they never scroll away
//   children — the body, which scrolls on its own
//
// TWO WAYS OF SHOWING, ONE COMPONENT
// On a wide screen inside the manager shell it DOCKS: it takes its own
// column beside the list (layout/detailDock.js), nothing is dimmed, and
// the list stays live — click another row and the panel changes to it.
// The tables drop columns to fit the room that is left (useTableView).
// It slides in as its column opens (.fx-dock in index.css), slides out
// the same way when closed, and the body dips and returns when a
// different record is put into it, so a change of row is seen to land.
// All of it is off under "Reduce movement".
//
// Anywhere narrower, or with no shell around it, it is a Sheet over the
// page: focus trapped while open, returned to the row on close. Wider
// than Sheet's default; the width class has to carry Sheet's own
// data-[side=right] variant, or tailwind-merge keeps both and Sheet's
// narrower one wins.
// ─────────────────────────────────────────────────────────────
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { DOCK_QUERY, setDockWidth, useDetailDock } from '@/components/layout/detailDock';

const subscribeWide = (fn) => {
  const mq = window.matchMedia?.(DOCK_QUERY);
  mq?.addEventListener('change', fn);
  return () => mq?.removeEventListener('change', fn);
};
const readWide = () => Boolean(window.matchMedia?.(DOCK_QUERY).matches);

// Escape belongs to whatever is open on top: a confirm dialog, a
// dropdown or a date picker inside the panel closes itself first.
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]';

const motionReduced = () => document.documentElement.getAttribute('data-stf-motion') === 'reduced';

// Most lists put a NEW panel in the dock when another row is clicked,
// rather than new content in the old one. That must not replay the
// opening — the column would shut and reopen, and the list jump, on
// every click. So a panel that arrives while one is still docked (or
// just after) is a change of record: it fades in at full width.
let docked = 0;
let lastUndocked = -Infinity;
let lastArrived = -Infinity;
const replacingAnother = () => {
  const swap = docked > 0 || performance.now() - lastUndocked < 250;
  lastArrived = performance.now();
  return swap;
};

// CLOSING. The pages take the panel away the moment it is closed —
// most stop rendering it altogether — so there is nothing left to
// animate. What slides shut is a copy: the panel's markup as it stood,
// inert, left in the dock for the 180ms it takes to close. The tables
// are only told the room is theirs again once it has gone, or the
// columns would come back into a list that is still narrow.
const GHOST = 'data-dock-ghost';
let ghosts = 0;
const clearGhosts = (dock) => dock.querySelectorAll(`[${GHOST}]`).forEach((g) => g.remove());

const slideShut = (section) => {
  const dock = section.parentNode;
  const scroller = section.querySelector('[data-dock-scroll]');
  const ghost = section.cloneNode(true);
  ghost.setAttribute(GHOST, '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.removeAttribute('data-slot');
  ghost.classList.remove('fx-dock');
  ghost.style.overflow = 'hidden';
  const inner = ghost.firstElementChild;
  inner?.classList.remove('fx-dock-body', 'fx-fade');
  dock.appendChild(ghost);
  const copy = ghost.querySelector('[data-dock-scroll]');
  if (copy && scroller) copy.scrollTop = scroller.scrollTop;

  ghosts += 1;
  const done = () => {
    ghost.remove();
    ghosts -= 1;
    if (docked === 0 && ghosts === 0) setDockWidth(0);
  };
  const timing = { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' };
  inner?.animate?.([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(16px)' }], timing);
  const closing = ghost.animate?.([{ width: `${section.offsetWidth}px` }, { width: '0px' }], timing);
  if (closing) closing.onfinish = done; else done();
};

function DockedPanel({ dock, onClose, eyebrow, title, badges, actions, children }) {
  // The inner element, which is full width from the first frame; the
  // outer one is still opening.
  const ref = useRef(null);
  const sectionRef = useRef(null);
  const bodyRef = useRef(null);
  const shown = useRef(title);
  const titleId = useId();
  const [swap] = useState(replacingAnother);

  // A different record in the same panel.
  useEffect(() => {
    if (shown.current === title) return;
    shown.current = title;
    if (motionReduced()) return;
    bodyRef.current?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }, [title]);

  // A layout effect, so its cleanup still finds the panel on the page.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    // A copy of the last record still sliding shut would sit beside this one.
    clearGhosts(dock);
    return () => {
      const replaced = performance.now() - lastArrived < 100;
      if (section?.parentNode && !replaced && !motionReduced()) slideShut(section);
    };
  }, [dock]);

  // Tell the tables how much room the record has taken.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const report = () => setDockWidth(el.offsetWidth);
    report();
    docked += 1;
    window.addEventListener('resize', report);
    return () => {
      window.removeEventListener('resize', report);
      docked -= 1;
      lastUndocked = performance.now();
      // Not at once: when another panel is taking this one's place the
      // tables would be told "no record" and "a record" in one breath.
      queueMicrotask(() => { if (docked === 0 && ghosts === 0) setDockWidth(0); });
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector(OVERLAYS)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <section
      ref={sectionRef}
      aria-labelledby={titleId}
      data-slot="detail-panel"
      className={`${swap ? '' : 'fx-dock '}h-full w-[30rem] border-l border-line bg-popover 2xl:w-[36rem]`}
    >
     <div ref={ref} className={`${swap ? 'fx-fade' : 'fx-dock-body'} relative flex h-full w-[30rem] flex-col text-sm text-popover-foreground 2xl:w-[36rem]`}>
      <div className="flex flex-col gap-1.5 border-b p-6 pr-14">
        {eyebrow ? <p className="min-w-0 break-words text-xs text-muted-foreground">{eyebrow}</p> : null}
        <h2 id={titleId} className="min-w-0 break-words font-heading text-lg font-medium text-foreground">{title}</h2>
        {badges ? <div className="flex flex-wrap gap-1.5 pt-1">{badges}</div> : null}
      </div>

      <div ref={bodyRef} data-dock-scroll="" className="flex-1 space-y-6 overflow-y-auto p-6">{children}</div>

      {actions ? (
        <div className="mt-auto flex flex-row flex-wrap gap-2 border-t p-6">{actions}</div>
      ) : null}

      <Button
        type="button" variant="ghost" size="icon-sm"
        className="absolute top-4 right-4 bg-secondary"
        onClick={onClose}
      >
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
     </div>
    </section>,
    dock,
  );
}

export default function DetailPanel({ open, onClose, eyebrow, title, badges, actions, children }) {
  const dock = useDetailDock();
  const wide = useSyncExternalStore(subscribeWide, readWide, () => false);

  if (dock && wide) {
    if (!open) return null;
    return (
      <DockedPanel dock={dock} onClose={onClose} eyebrow={eyebrow} title={title} badges={badges} actions={actions}>
        {children}
      </DockedPanel>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b pr-14">
          {eyebrow ? (
            <SheetDescription className="min-w-0 break-words text-xs">{eyebrow}</SheetDescription>
          ) : null}
          {/* break-words: a 30-character SKU or a generated product
              name has no spaces to wrap at. */}
          <SheetTitle className="min-w-0 break-words text-lg">{title}</SheetTitle>
          {badges ? <div className="flex flex-wrap gap-1.5 pt-1">{badges}</div> : null}
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">{children}</div>

        {actions ? (
          <SheetFooter className="flex-row flex-wrap border-t">{actions}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
