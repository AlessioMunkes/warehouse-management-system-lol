// ─────────────────────────────────────────────────────────────
// client/src/features/suppliers/SupplierForm.jsx
//
// Registration and edit in one component — the fields are identical
// and two copies would drift, the same reasoning as the new/existing
// branch in the picking slip view.
//
// Built on FieldGroup / Field / FieldLabel / FieldDescription /
// FieldError from @/components/ui/field. Hints and validation messages
// are NOT hand-written <p> tags: FieldDescription and FieldError
// already carry the right size, colour and spacing, and FieldError
// renders role="alert" so a screen reader announces it.
//
// ONLY `name` IS REQUIRED.
// Ubuntu Bakery Supplies has no agreement_ref on record today, and a
// form that insists on one cannot represent the suppliers that
// actually exist.
//
// Two of the optional fields matter later: the lead time and the
// products supplied. Saving with either blank shows
// MissingDetailsNotice first — what will go without it, and "Save
// anyway".
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldDescription, FieldError,
} from '@/components/ui/field';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 }  from 'lucide-react';
import MissingDetailsNotice from '@/components/ui/missing-details-notice';

const BLANK = {
  name: '', contactName: '', contactEmail: '', contactPhone: '',
  address: '', agreementRef: '', paymentTerms: '',
  expectedLeadTimeDays: '', category: '', notes: '',
};

export default function SupplierForm({
  initial = null,
  // The catalogue, to tick what this supplier supplies from.
  products = [],
  submitLabel = 'Register supplier',
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const [form, setForm] = useState({ ...BLANK, ...(initial ?? {}) });
  const [touchedName, setTouchedName] = useState(false);
  // What they supply, as product ids. A purchase order to this supplier
  // offers only these; none ticked leaves it unrestricted.
  const [productIds, setProductIds] = useState(() => (initial?.suppliedProducts ?? []).map((p) => p.id));
  const [productSearch, setProductSearch] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const nameMissing = !String(form.name ?? '').trim();
  const nameInvalid = touchedName && nameMissing;

  const toggleProduct = (id) => setProductIds((ids) => (
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  ));
  const needle = productSearch.trim().toLowerCase();
  const shownProducts = needle ? products.filter((p) => p.name.toLowerCase().includes(needle)) : products;

  // The blank details being asked about, while the notice is showing.
  const [missing, setMissing] = useState(null);

  const payload = () => ({
      ...form,
      productIds,
      // The service maps '' to null anyway, but sending null is
      // clearer about the intent and keeps the payload honest.
      expectedLeadTimeDays:
        form.expectedLeadTimeDays === '' || form.expectedLeadTimeDays === null
          ? null
          : Number(form.expectedLeadTimeDays),
  });

  const submit = () => {
    setTouchedName(true);
    if (nameMissing) return;
    const blank = [];
    if (form.expectedLeadTimeDays === '' || form.expectedLeadTimeDays === null || form.expectedLeadTimeDays === undefined) {
      blank.push({ field: 'Expected lead time', consequence: 'Reports cannot tell whether this supplier’s deliveries arrive late.' });
    }
    if (products.length > 0 && productIds.length === 0) {
      blank.push({ field: 'Products supplied', consequence: 'Purchase orders to this supplier will offer every product, not only what they supply.' });
    }
    if (blank.length > 0) { setMissing(blank); return; }
    onSubmit(payload());
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
            placeholder="Rice, sugar, lentils"
          />
          <FieldDescription>Say what they supply in a few words.</FieldDescription>
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

      {products.length > 0 ? (
        <Field>
          <FieldLabel htmlFor="supplier-product-search">Products supplied</FieldLabel>
          <Input
            id="supplier-product-search" type="search" placeholder="Search products"
            value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
          />
          <div className="max-h-56 overflow-y-auto rounded-md border" role="group" aria-label="Product list">
            {shownProducts.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No product matches the search.</p>
            ) : shownProducts.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                <input
                  type="checkbox" className="size-4"
                  checked={productIds.includes(p.id)} onChange={() => toggleProduct(p.id)}
                />
                <span className="min-w-0 break-words">{p.name}</span>
              </label>
            ))}
          </div>
          <FieldDescription>
            {productIds.length === 0
              ? 'Tick what this supplier supplies. Purchase orders to them then offer only those products. With none ticked, every product is offered.'
              : `${productIds.length} ticked. Purchase orders to this supplier offer only these.`}
          </FieldDescription>
        </Field>
      ) : null}

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
        <FieldDescription>Days from order to delivery. Used to report late deliveries.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="supplier-notes">Notes</FieldLabel>
        <Textarea id="supplier-notes" rows={3} value={form.notes} onChange={set('notes')} />
      </Field>

      {missing ? (
        <MissingDetailsNotice
          items={missing} busy={busy}
          onConfirm={() => onSubmit(payload())}
          onCancel={() => setMissing(null)}
        />
      ) : (
        <Field orientation="horizontal">
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? 'Saving' : submitLabel}
          </Button>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          ) : null}
        </Field>
      )}
    </FieldGroup>
  );
}
