// ─────────────────────────────────────────────────────────────
// features/purchaseOrders/components/PurchaseOrderForm.jsx
//
// Raise a purchase order.
//
// Built on FieldGroup / Field / FieldLabel / FieldDescription /
// FieldError from @/components/ui/field, following SupplierForm.jsx
// and through it client/src/components/login-form.jsx. Hints and
// errors are NOT hand-written <p> tags: FieldDescription and
// FieldError already carry the right size, colour and spacing, and
// FieldError renders role="alert" so a screen reader announces it.
//
// UNLIKE SupplierForm, WHICH REQUIRES ONLY A NAME.
// A supplier record can be half-known and still useful. A purchase
// order is the document the warehouse checks a delivery against, so a
// missing quantity here becomes an argument between Mcebisi and a
// driver at the gate — exactly the argument Warehouse Visit 2.5 says
// the system exists to prevent. Supplier, date and at least one
// complete line are all required.
//
// The client checks are a courtesy, not the rule. Every one of them is
// enforced again in purchaseOrder.service.js, because a check that
// only the browser performs is not a check.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldDescription, FieldError,
} from '@/components/ui/field';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import PurchaseOrderLines from './PurchaseOrderLines';
import { blankLine } from './purchaseOrderLine';

// Render runs UTC and the warehouse does not. Between midnight and
// 02:00 SAST the container still thinks it is yesterday, so a date
// picker bounded by the browser's idea of today would let a manager
// pick a date the server then rejects as past. Fixed +02:00 — South
// Africa has no DST. Same helper as todayInSAST in
// purchaseOrder.service.js; duplicated because the client cannot
// import server code, and both need it.
const todayInSAST = () =>
  new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function PurchaseOrderForm({
  suppliers = [],
  products = [],
  onSubmit,
  onCancel,
  busy = false,
  error = null,
  invalidProductIds = [],
}) {
  const [form, setForm] = useState({
    supplierId: '', expectedDeliveryDate: '', quickbooksPoId: '', notes: '',
  });
  const [lines, setLines]     = useState([blankLine()]);
  const [touched, setTouched] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Only suppliers we can actually order from. An inactive one is a
  // 409 from the service, and offering a choice that always fails is
  // worse than not offering it.
  const orderable = suppliers.filter((s) => s.isActive);

  const filled = lines.filter((l) => l.productId && Number(l.expectedQuantity) > 0);

  const problems = [];
  if (!form.supplierId) problems.push('Choose a supplier.');
  if (!form.expectedDeliveryDate) problems.push('Set an expected delivery date.');
  else if (form.expectedDeliveryDate < todayInSAST()) {
    problems.push('Expected delivery date cannot be in the past.');
  }
  if (!filled.length) problems.push('Add at least one item with a quantity.');

  const submit = () => {
    setTouched(true);
    if (problems.length) return;
    onSubmit({
      supplierId: Number(form.supplierId),
      expectedDeliveryDate: form.expectedDeliveryDate,
      quickbooksPoId: form.quickbooksPoId.trim() || null,
      notes: form.notes.trim() || null,
      // Empty strings, not zeros, for the optional numerics — the
      // service maps '' to null, and Number('') would be 0.
      items: filled.map((l) => ({
        productId:        Number(l.productId),
        expectedQuantity: Number(l.expectedQuantity),
        expectedWeightKg: l.expectedWeightKg === '' ? null : Number(l.expectedWeightKg),
        unitPrice:        l.unitPrice === '' ? null : Number(l.unitPrice),
      })),
    });
  };

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}

      <div className="grid gap-7 sm:grid-cols-2">
        <Field data-invalid={(touched && !form.supplierId) || undefined}>
          <FieldLabel htmlFor="po-supplier">Supplier</FieldLabel>
          <Select
            value={form.supplierId || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
            disabled={busy}
          >
            <SelectTrigger id="po-supplier">
              <SelectValue placeholder="Choose a supplier" />
            </SelectTrigger>
            <SelectContent>
              {orderable.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {orderable.length === 0 ? (
            <FieldDescription>
              No active suppliers. Register one under Suppliers first.
            </FieldDescription>
          ) : null}
        </Field>

        <Field data-invalid={(touched && !form.expectedDeliveryDate) || undefined}>
          <FieldLabel htmlFor="po-date">Expected delivery date</FieldLabel>
          {/* A native date input rather than
              features/procurement/components/DatePicker.jsx: that one
              is styled with the legacy .stf- / form-label classes of
              the receiving wizard, and dropping it into a shadcn Field
              would put two design systems in one form. */}
          <Input
            id="po-date" type="date"
            min={todayInSAST()}
            value={form.expectedDeliveryDate}
            onChange={set('expectedDeliveryDate')}
            disabled={busy}
          />
          <FieldDescription>
            Receiving lists purchase orders by this date, and on-time reporting measures against it.
          </FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel>Items</FieldLabel>
        <PurchaseOrderLines
          lines={lines}
          products={products}
          onChange={setLines}
          disabled={busy}
          invalidProductIds={invalidProductIds}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="po-qbo">QuickBooks reference</FieldLabel>
        <Input
          id="po-qbo"
          value={form.quickbooksPoId}
          onChange={set('quickbooksPoId')}
          placeholder="Leave blank unless you have already raised it there"
          disabled={busy}
        />
        {/* Warehouse Visit 2.4: the WMS owns the PO number. This is
            only where QuickBooks' own reference gets recorded, so the
            two can be reconciled until the OAuth spike lands. */}
        <FieldDescription>
          The WMS generates the PO number. This is only QuickBooks' reference for the same order.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="po-notes">Notes</FieldLabel>
        <Textarea
          id="po-notes" rows={3}
          value={form.notes} onChange={set('notes')}
          placeholder="Delivery window, gate access, who to call"
          disabled={busy}
        />
        <FieldDescription>Visible to whoever receives the delivery.</FieldDescription>
      </Field>

      {touched && problems.length ? (
        <FieldError>{problems.join(' ')}</FieldError>
      ) : null}

      <Field orientation="horizontal">
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? 'Saving' : 'Raise purchase order'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </Field>
    </FieldGroup>
  );
}
