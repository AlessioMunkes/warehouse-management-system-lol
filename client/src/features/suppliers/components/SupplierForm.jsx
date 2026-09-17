// ─────────────────────────────────────────────────────────────
// client/src/features/suppliers/components/SupplierForm.jsx
//
// Registration and edit in one component — the fields are identical
// and two copies would drift, the same reasoning as the new/existing
// branch in the picking slip view.
//
// Built on FieldGroup / Field / FieldLabel / FieldDescription /
// FieldError from @/components/ui/field, following
// client/src/components/login-form.jsx. Hints and validation messages
// are NOT hand-written <p> tags: FieldDescription and FieldError
// already carry the right size, colour and spacing, and FieldError
// renders role="alert" so a screen reader announces it.
//
// ONLY `name` IS REQUIRED.
// Ubuntu Bakery Supplies has no agreement_ref on record today, and a
// form that insists on one cannot represent the suppliers that
// actually exist.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldDescription, FieldError,
} from '@/components/ui/field';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 }  from 'lucide-react';

const BLANK = {
  name: '', contactName: '', contactEmail: '', contactPhone: '',
  address: '', agreementRef: '', paymentTerms: '',
  expectedLeadTimeDays: '', category: '', notes: '',
};

export default function SupplierForm({
  initial = null,
  submitLabel = 'Register supplier',
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const [form, setForm] = useState({ ...BLANK, ...(initial ?? {}) });
  const [touchedName, setTouchedName] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const nameMissing = !String(form.name ?? '').trim();
  const nameInvalid = touchedName && nameMissing;

  const submit = () => {
    setTouchedName(true);
    if (nameMissing) return;
    onSubmit({
      ...form,
      // The service maps '' to null anyway, but sending null is
      // clearer about the intent and keeps the payload honest.
      expectedLeadTimeDays:
        form.expectedLeadTimeDays === '' || form.expectedLeadTimeDays === null
          ? null
          : Number(form.expectedLeadTimeDays),
    });
  };

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}

      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor="supplier-name">Supplier name</FieldLabel>
        <Input
          id="supplier-name"
          value={form.name}
          onChange={set('name')}
          onBlur={() => setTouchedName(true)}
          placeholder="Peninsula Fresh Wholesalers"
          aria-invalid={nameInvalid || undefined}
        />
        {nameInvalid ? <FieldError>A name is required.</FieldError> : null}
      </Field>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="supplier-contact">Contact person</FieldLabel>
          <Input id="supplier-contact" value={form.contactName} onChange={set('contactName')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-category">Category</FieldLabel>
          <Input
            id="supplier-category"
            value={form.category}
            onChange={set('category')}
            placeholder="Dry goods, fresh produce, cold chain"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-email">Email</FieldLabel>
          <Input id="supplier-email" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-phone">Phone</FieldLabel>
          <Input id="supplier-phone" value={form.contactPhone} onChange={set('contactPhone')} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="supplier-address">Address</FieldLabel>
        <Textarea id="supplier-address" rows={2} value={form.address} onChange={set('address')} />
      </Field>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="supplier-agreement">Agreement reference</FieldLabel>
          <Input
            id="supplier-agreement"
            value={form.agreementRef}
            onChange={set('agreementRef')}
            placeholder="LOL-SUP-2026-005"
          />
          <FieldDescription>Leave blank if nothing is on file yet.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-terms">Payment terms</FieldLabel>
          <Input
            id="supplier-terms"
            value={form.paymentTerms}
            onChange={set('paymentTerms')}
            placeholder="30 days from invoice"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="supplier-leadtime">Expected lead time (days)</FieldLabel>
        <Input
          id="supplier-leadtime"
          type="number"
          min="0"
          max="365"
          value={form.expectedLeadTimeDays ?? ''}
          onChange={set('expectedLeadTimeDays')}
        />
        {/* This is the column on-time reporting measures against, so
            it is worth filling in even approximately. */}
        <FieldDescription>Order to delivery. On-time reporting compares against this.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="supplier-notes">Notes</FieldLabel>
        <Textarea id="supplier-notes" rows={3} value={form.notes} onChange={set('notes')} />
      </Field>

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
