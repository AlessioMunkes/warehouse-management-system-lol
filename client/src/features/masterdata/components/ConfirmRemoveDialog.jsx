// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/components/ConfirmRemoveDialog.jsx
//
// One dialog, three answers: Cancel, Deactivate, Delete.
//
// WHY THE MIDDLE OPTION IS HERE AT ALL
// A normal confirmation asks "are you sure?" about the thing you
// already chose. This one exists because the two destructive options
// are easy to confuse and only one of them can be undone, so the
// moment to explain the difference is the moment somebody is about to
// pick between them — not in a tooltip they will never open.
//
// IT HAS TO FIT ON THE SCREEN IN ONE LOOK.
// The first version explained itself in two full paragraphs and the
// result was a dialog that scrolled — vertically because the prose ran
// past the viewport, and HORIZONTALLY because the title held the item's
// name and a generated product name
// ("Access Check Resolved access-check-1787871216023") has no spaces
// to wrap at, so it pushed the grid wider than the popup. A warning
// somebody has to scroll around to read is a warning they will skip,
// which is the opposite of the point. Three things fix it:
//
//   The name is not in the title.  The title is a short fixed
//     question and the name sits under it on its own line, where it
//     can wrap and break mid-token without dragging the layout with it.
//
//   The explanations are one line each.  Not shorter to save space —
//     shorter so they are read. "Reversible" and "Cannot be undone"
//     are the whole decision; everything else was supporting detail
//     that made the decision harder to find.
//
//   min-w-0 on the grid children.  A grid item's default min-width is
//     auto, meaning "at least as wide as my content", so one
//     unbreakable string sets the width of the dialog no matter what
//     max-width says. This is the reason the horizontal scrollbar
//     appeared at all, and break-words alone does not fix it.
//
// Sharper corners and tighter padding than the app's default dialog,
// deliberately. The rounded-4xl popup reads as friendly, and this is
// the one dialog in the app where the wrong tap cannot be undone.
//
// Nothing here talks to the server. The page owns the calls and owns
// the error banner, so a failed delete reports itself in the same
// place as every other failure on that screen.
// ─────────────────────────────────────────────────────────────
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Power, Trash2 } from 'lucide-react';

export default function ConfirmRemoveDialog({
  open,
  onOpenChange,
  // What is being removed: "Butternut", "Bokomo Foods", "S. Ndlovu".
  name,
  // The lowercase noun used in the sentences — 'product', 'supplier',
  // 'account'. Keeps the copy reading naturally on all three screens
  // without three copies of the dialog.
  noun = 'item',
  // Where it still shows up after deletion, in the reader's own words.
  // One short line: products, suppliers and accounts each have a
  // different honest answer to "so where does it still appear?".
  historyNote,
  // An already-inactive item cannot be deactivated again, so that
  // option is replaced by a line saying so rather than offered as a
  // button that does nothing.
  isActive = true,
  busy = false,
  onDeactivate,
  onDelete,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="gap-4 rounded-lg p-5 data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-md"
      >
        {/* min-w-0 is doing real work on every one of these children.
            Without it the grid sizes itself to the longest unbreakable
            string and the dialog scrolls sideways. */}
        <AlertDialogHeader className="min-w-0 gap-1">
          <AlertDialogTitle className="text-base">
            Remove this {noun}?
          </AlertDialogTitle>
          {/* The name, out of the title so it can wrap. break-all
              rather than break-words: the values that broke this were
              generated SKUs and access-check names with no spaces at
              all, which break-words leaves alone. */}
          <AlertDialogDescription className="min-w-0 break-all font-medium text-foreground">
            {name}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-w-0 space-y-2 text-sm">
          <div className="min-w-0 rounded-md border px-3 py-2">
            <p className="font-semibold">Deactivate</p>
            <p className="text-muted-foreground">
              Hidden from every list staff pick from. Stays here under “Show
              inactive”. <span className="font-medium text-foreground">Reversible.</span>
            </p>
          </div>

          <div className="min-w-0 rounded-md border border-[#ef3a40]/40 bg-[#fff4f2] px-3 py-2">
            <p className="font-semibold text-[#ef3a40]">Delete</p>
            <p className="text-[#2b3336]">
              That, and it leaves this screen for good.{' '}
              <span className="font-semibold">Cannot be undone.</span>
            </p>
            <p className="mt-1 text-[#2b3336]">{historyNote}</p>
          </div>
        </div>

        {/* Not AlertDialogFooter: its default is flex-col-reverse, which
            on a phone stacked "Delete permanently" at the TOP, first
            under the thumb, with Cancel buried at the bottom. Exactly
            backwards here. This is the same row, ordered the same way
            at every width. */}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-end">
          {/* Cancel first and plainest. It is the answer most people
              want when a dialog like this appears unexpectedly, and it
              should not take any reading to find. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          {isActive ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDeactivate}>
              <Power />
              Deactivate
            </Button>
          ) : (
            <span className="self-center px-2 text-sm text-muted-foreground">
              Already deactivated
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onDelete}
            className="border-[#ef3a40] text-[#ef3a40] hover:bg-[#ef3a40] hover:text-white"
          >
            <Trash2 />
            Delete permanently
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
