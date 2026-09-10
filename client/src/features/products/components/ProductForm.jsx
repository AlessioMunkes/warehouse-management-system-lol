// ─────────────────────────────────────────────────────────────
// client/src/features/products/components/ProductForm.jsx
//
// Registration and edit in one component, same reasoning as
// SupplierForm.jsx/UserForm.jsx — the fields are identical and two
// copies would drift.
//
// `name`, `sku` AND `defaultUnit` ARE REQUIRED, matching
// product.service.js. SKU used to be described here as optional; that
// was wrong against the database — products.stock_keeping_unit is NOT
// NULL and UNIQUE, so it can neither be omitted nor defaulted to ''
// (the second product to try that collides on the unique index).
// Category, weight and is_perishable are genuinely optional.
//
// The unit is a dropdown, not a text box, because stock_levels.unit
// and stock_movements.unit both carry a CHECK constraint allowing
// exactly the nine values in STOCK_UNITS. A free-typed "bags" is not a
// validation message, it is a 23514 raised mid-transaction. Storage
// type is the same story on a smaller enum — products.storage_type
// allows only 'dry' or 'cold' — so it gets the same Select treatment
// rather than a free-typed value or a checkbox.
//
// default_location_id is deliberately NOT a field here. It exists on
// the product and is round-tripped by productAPI's toProduct mapper,
// but there is no storage-locations list endpoint yet to populate a
// picker from — that's a later change, not a text box standing in for
// one now.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldDescription, FieldError,
} from '@/components/ui/field';
import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import { Checkbox }  from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 }   from 'lucide-react';
import { STOCK_UNITS } from '@/services/productAPI';

// products.storage_type's own CHECK constraint — 'dry' or 'cold', and
// nothing else. Small and closed enough that it isn't worth exporting
// from productAPI.js the way STOCK_UNITS is; product.service.js keeps
// its own equivalent unexported for the same reason.
const STORAGE_TYPES = ['dry', 'cold'];

const BLANK = {
  name: '', sku: '', defaultUnit: '', weightKg: '',
  category: '', isPerishable: false, reorderThreshold: '',
  storageType: 'dry',
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
  const [touchedSku,  setTouchedSku]  = useState(false);
  const [touchedUnit, setTouchedUnit] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const nameMissing = !String(form.name ?? '').trim();
  const nameInvalid = touchedName && nameMissing;
  const skuMissing  = !String(form.sku ?? '').trim();
  const skuInvalid  = touchedSku && skuMissing;
  const unitMissing = !String(form.defaultUnit ?? '').trim();
  const unitInvalid = touchedUnit && unitMissing;

  const submit = () => {
    setTouchedName(true);
    setTouchedSku(true);
    setTouchedUnit(true);
    if (nameMissing || skuMissing || unitMissing) return;
    onSubmit({
      ...form,
      // The service maps '' to null anyway, but sending null is
      // clearer about the intent, same reasoning SupplierForm's
      // expectedLeadTimeDays uses.
      weightKg: form.weightKg === '' || form.weightKg === null ? null : Number(form.weightKg),
      // Blank means "leave it alone" on an edit, and the column
      // default (0) on a create — not zero typed deliberately.
      reorderThreshold:
        form.reorderThreshold === '' || form.reorderThreshold === null
          ? null
          : Number(form.reorderThreshold),
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
        <Field data-invalid={skuInvalid || undefined}>
          <FieldLabel htmlFor="product-sku">SKU</FieldLabel>
          <Input
            id="product-sku"
            value={form.sku}
            onChange={set('sku')}
            onBlur={() => setTouchedSku(true)}
            placeholder="MM-10KG"
            aria-invalid={skuInvalid || undefined}
          />
          {skuInvalid
            ? <FieldError>A SKU is required.</FieldError>
            : <FieldDescription>Must be unique across the catalogue.</FieldDescription>}
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
          <Select
            value={form.defaultUnit || undefined}
            onValueChange={(v) => {
              setForm((f) => ({ ...f, defaultUnit: v }));
              setTouchedUnit(true);
            }}
          >
            <SelectTrigger id="product-unit" aria-invalid={unitInvalid || undefined}>
              <SelectValue placeholder="Select a unit" />
            </SelectTrigger>
            <SelectContent>
              {STOCK_UNITS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {unitInvalid
            ? <FieldError>A default unit is required.</FieldError>
            : <FieldDescription>What receiving and the stock ledger count this in.</FieldDescription>}
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

      <div className="grid gap-7 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="product-storage-type">Storage type</FieldLabel>
          <Select
            value={form.storageType || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, storageType: v }))}
          >
            <SelectTrigger id="product-storage-type">
              <SelectValue placeholder="Select a storage type" />
            </SelectTrigger>
            <SelectContent>
              {STORAGE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Where this is kept — dry storage or cold chain.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="product-reorder">Reorder threshold</FieldLabel>
          <Input
            id="product-reorder"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={form.reorderThreshold ?? ''}
            onChange={set('reorderThreshold')}
          />
          {/* Read by the inventory manifest, the manager dashboard and
              the reorder report, and until now settable by nothing. The
              comparison is against AVAILABLE stock (on hand minus what
              is packed and waiting for a driver), not the raw on-hand
              figure. */}
          <FieldDescription>
            Flag as low when available stock falls to this level. Leave blank to keep the
            current setting; 0 means never flag it.
          </FieldDescription>
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
