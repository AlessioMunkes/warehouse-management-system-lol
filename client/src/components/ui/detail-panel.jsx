// ─────────────────────────────────────────────────────────────
// client/src/components/ui/detail-panel.jsx
//
// One record, opened from its row, in a panel down the right-hand side
// — the list stays where it was behind it, so closing the panel puts
// the manager back exactly where they were.
//
//   open     — whether it is showing
//   onClose  — closes it (Escape, the × and the overlay all call this)
//   eyebrow  — small line above the title (a SKU, a reference number)
//   title    — what this record is
//   badges   — status pills under the title
//   actions  — Buttons pinned to the bottom, so they never scroll away
//   children — the body, which scrolls on its own
//
// Built on Sheet, so focus is trapped while it is open and returns to
// the row that opened it when it closes. Wider than Sheet's default:
// a figure grid and a chart need more than 384px.
// ─────────────────────────────────────────────────────────────
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

export default function DetailPanel({ open, onClose, eyebrow, title, badges, actions, children }) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
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
