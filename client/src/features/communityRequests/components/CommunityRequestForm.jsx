// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/components/CommunityRequestForm.jsx
//
// Logging a benevolent package request (ADM-5.0 / BR-28). Same
// construction as ProductForm.jsx / SupplierForm.jsx — FieldGroup /
// Field / FieldLabel / FieldDescription / FieldError, a gap-7
// sm:grid-cols-2 row rhythm, and a horizontal primary + Cancel footer.
// No new colours, spacing or components.
//
// This form only LOGS a request. The outcome is not set here — a new
// request always starts 'pending' server-side, and is claimed and
// resolved later from the list. items_requested is the only required
// field; BR-28 makes the caller's name optional and the quantity is a
// free-text note ("Enough for roughly 80 plates"), not a number.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldDescription, FieldError,
} from '@/components/ui/field';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

const BLANK = {
  callerName: '', callerContact: '', itemsRequested: '',
  quantityNote: '', requestedAt: '',
};

export default function CommunityRequestForm({
  submitLabel = 'Log request',
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const [form, setForm] = useState({ ...BLANK });
  const [touchedItems, setTouchedItems] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const itemsMissing = !String(form.itemsRequested ?? '').trim();
  const itemsInvalid = touchedItems && itemsMissing;

  const submit = () => {
    setTouchedItems(true);
    if (itemsMissing) return;
    onSubmit({
      ...form,
      // The service maps '' to null anyway, but sending null keeps the
      // payload honest — same reasoning as SupplierForm's lead time.
      requestedAt: form.requestedAt === '' ? null : form.requestedAt,
    });
  };

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}

      <Field data-invalid={itemsInvalid || undefined}>
        <FieldLabel htmlFor="cr-items">What was requested</FieldLabel>
        <Textarea
          id="cr-items"
          rows={3}
          value={form.itemsRequested}
          onChange={set('itemsRequested')}
          onBlur={() => setTouchedItems(true)}
          placeholder="e.g. Samp, sugar beans, cooking oil"
          aria-invalid={itemsInvalid || undefined}
        />
        {itemsInvalid
          ? <FieldError>Describe what was requested.</FieldError>
          : <FieldDescription>Free text — no stock code needed.</FieldDescription>}
      </Field>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="cr-caller-name">Caller name</FieldLabel>
          <Input
            id="cr-caller-name"
            value={form.callerName}
            onChange={set('callerName')}
            placeholder="Optional"
          />
          <FieldDescription>Leave blank if they did not give one.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="cr-caller-contact">Preferred contact</FieldLabel>
          <Input
            id="cr-caller-contact"
            value={form.callerContact}
            onChange={set('callerContact')}
            placeholder="Phone, WhatsApp, email…"
          />
          <FieldDescription>How to reach them about this request.</FieldDescription>
        </Field>
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="cr-quantity-note">Quantity note</FieldLabel>
          <Input
            id="cr-quantity-note"
            value={form.quantityNote}
            onChange={set('quantityNote')}
            placeholder="e.g. Enough for roughly 80 plates"
          />
          <FieldDescription>In their words — no need for exact numbers.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="cr-requested-at">Date &amp; time of request</FieldLabel>
          <Input
            id="cr-requested-at"
            type="datetime-local"
            value={form.requestedAt}
            onChange={set('requestedAt')}
          />
          <FieldDescription>Leave blank to use now.</FieldDescription>
        </Field>
      </div>

      <Field orientation="horizontal">
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? 'Saving' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        ) : null}
      </Field>
    </FieldGroup>
  );
}
