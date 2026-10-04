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
//
// Anywhere narrower, or with no shell around it, it is a Sheet over the
// page: focus trapped while open, returned to the row on close. Wider
// than Sheet's default; the width class has to carry Sheet's own
// data-[side=right] variant, or tailwind-merge keeps both and Sheet's
// narrower one wins.
// ─────────────────────────────────────────────────────────────
import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
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

function DockedPanel({ dock, onClose, eyebrow, title, badges, actions, children }) {
  const ref = useRef(null);
  const titleId = useId();

  // Tell the tables how much room the record has taken.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const report = () => setDockWidth(el.offsetWidth);
    report();
    window.addEventListener('resize', report);
    return () => { window.removeEventListener('resize', report); setDockWidth(0); };
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
      ref={ref}
      aria-labelledby={titleId}
      data-slot="detail-panel"
      className="relative flex h-full w-[30rem] flex-col border-l border-line bg-popover text-sm text-popover-foreground 2xl:w-[36rem]"
    >
      <div className="flex flex-col gap-1.5 border-b p-6 pr-14">
        {eyebrow ? <p className="min-w-0 break-words text-xs text-muted-foreground">{eyebrow}</p> : null}
        <h2 id={titleId} className="min-w-0 break-words font-heading text-lg font-medium text-foreground">{title}</h2>
        {badges ? <div className="flex flex-wrap gap-1.5 pt-1">{badges}</div> : null}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">{children}</div>

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
