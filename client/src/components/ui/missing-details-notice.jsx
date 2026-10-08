// ─────────────────────────────────────────────────────────────
// client/src/components/ui/missing-details-notice.jsx
//
// Shown in place of a form's Save button when optional fields were left
// blank that something else relies on. It does not stop the save: it
// says what each blank will mean later, and offers "Save anyway" or a
// way back to fill them in.
//
// `items` is [{ field, consequence }] — the field as its label reads,
// and one sentence on what goes without it.
// ─────────────────────────────────────────────────────────────
import { TriangleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MissingDetailsNotice({ items, onConfirm, onCancel, busy = false }) {
  return (
    <div
      role="alertdialog" aria-labelledby="missing-details-title"
      className="rounded-lg border border-warn/40 bg-warn-soft p-4 text-sm"
    >
      <p id="missing-details-title" className="flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden="true" />
        {items.length === 1 ? 'One detail is blank' : 'Some details are blank'}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.field}>
            <span className="font-medium">{item.field}:</span> {item.consequence}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-muted-foreground">You can save now and fill these in later.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? 'Saving' : 'Save anyway'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Go back and fill in</Button>
      </div>
    </div>
  );
}
