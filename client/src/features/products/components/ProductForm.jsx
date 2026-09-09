// ─────────────────────────────────────────────────────────────
// client/src/features/products/components/ProductForm.jsx
//
// Registration and edit in one component, same reasoning as
// SupplierForm.jsx/UserForm.jsx — the fields are identical and two
// copies would drift.
//
// `name`, `sku` AND `defaultUnit` ARE REQUIRED. SKU is not optional
// whatever an earlier version of this comment said: products
// .stock_keeping_unit is NOT NULL UNIQUE, so a blank one is a 400 from
// the server rather than a product without a code. Matching
// product.service.js's buildProductPayload exactly. Everything else
// (SKU, category, weight, is_perishable) is optional — plenty of
// products in the current catalog have no SKU on record.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldDescription, FieldError,
} from '@/components/ui/field';
import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import { Checkbox }  from '@/components/ui/checkbox';
import { Loader2 }   from 'lucide-react';

const BLANK = {
  name: '', sku: '', defaultUnit: '', weightKg: '',
  category: '', isPerishable: false,
};

export default function ProductForm({
  initial = null,
  submitLabel = 'Add product',
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const [form, setForm] = useState({ ...BLANK, ...(initial ?? {}) });
  const [touchedName, setTouchedName] = useState(false);
  const [touchedUnit, setTouchedUnit] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const nameMissing = !String(form.name ?? '').trim();
  const nameInvalid = touchedName && nameMissing;
  const unitMissing = !String(form.defaultUnit ?? '').trim();
  const unitInvalid = touchedUnit && unitMissing;

  const submit = () => {
    setTouchedName(true);
    setTouchedUnit(true);
    if (nameMissing || unitMissing) return;
    onSubmit({
      ...form,
      // The service maps '' to null anyway, but sending null is
      // clearer about the intent, same reasoning SupplierForm's
      // expectedLeadTimeDays uses.
      weightKg: form.weightKg === '' || form.weightKg === null ? null : Number(form.weightKg),
    });
  };

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}

      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor="product-name">Product name</FieldLabel>
        <Input
          id="product-name"
          value={form.name}
          onChange={set('name')}
          onBlur={() => setTouchedName(true)}
          placeholder="Maize meal 10kg"
          aria-invalid={nameInvalid || undefined}
        />
        {nameInvalid ? <FieldError>A name is required.</FieldError> : null}
      </Field>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="product-sku">SKU</FieldLabel>
          <Input
            id="product-sku"
            value={form.sku}
            onChange={set('sku')}
            placeholder="MM-10KG"
          />
          <FieldDescription>Leave blank if nothing is on file yet.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="product-category">Category</FieldLabel>
          <Input
            id="product-category"
            value={form.category}
            onChange={set('category')}
            placeholder="Dry goods, fresh produce, cold chain"
          />
        </Field>
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field data-invalid={unitInvalid || undefined}>
          <FieldLabel htmlFor="product-unit">Default unit</FieldLabel>
          <Input
            id="product-unit"
            value={form.defaultUnit}
            onChange={set('defaultUnit')}
            onBlur={() => setTouchedUnit(true)}
            placeholder="bag, crate, kg"
            aria-invalid={unitInvalid || undefined}
          />
          {unitInvalid ? <FieldError>A default unit is required.</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="product-weight">Weight (kg)</FieldLabel>
          <Input
            id="product-weight"
            type="number"
            min="0"
            step="0.01"
            value={form.weightKg ?? ''}
            onChange={set('weightKg')}
          />
          {/* Genuinely optional — plenty of products are counted, not
              weighed. */}
          <FieldDescription>Leave blank for items that are counted, not weighed.</FieldDescription>
        </Field>
      </div>

      <Field orientation="horizontal">
        <Checkbox
          id="product-perishable"
          checked={form.isPerishable}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, isPerishable: checked === true }))}
        />
        <FieldLabel htmlFor="product-perishable" className="font-normal">
          This item is perishable
        </FieldLabel>
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
