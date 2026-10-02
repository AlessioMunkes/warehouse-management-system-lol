// ─────────────────────────────────────────────────────────────
// client/src/features/pickingSlips/components/SlipForms.jsx
//
// The three things a manager fills in on the Picking Slips screen —
// generate the week's slips, create one by hand, edit one still on the
// floor. Moved out of PickingSlipManagementPage.jsx unchanged in what
// they send; each now holds its own form state, and the page only
// hears back what to show next.
//
// Editing is only offered while a slip is 'pending' — the repository
// enforces it inside the same row lock every other mutation uses,
// since 'pending' is the only state where every item is guaranteed
// untouched. A packer mid-count never sees their list rewritten.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input }    from '@/components/ui/input';
import { Button }   from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { generateSlips, createSlip, editSlip } from '../../../services/pickingAPI';
import { todaySast } from '../slipViews';
import ErrorBanner from '@/components/ui/error-banner';

const COHORT_OPTIONS = [
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'thursday', label: 'Thursday' },
];

const SuccessBanner = ({ message }) => (
  <div className="p-4 rounded-[4px] bg-good-soft border-2 border-good text-ink text-sm">{message}</div>
);

const CohortSelect = ({ id, value, onChange }) => (
  <Select value={value || undefined} onValueChange={onChange}>
    <SelectTrigger id={id}><SelectValue placeholder="Select a cohort" /></SelectTrigger>
    <SelectContent>
      {COHORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
    </SelectContent>
  </Select>
);

const linesInvalid = (items) =>
  items.length === 0 || items.some((l) => !l.productId || !l.quantity || Number(l.quantity) <= 0);

const toPayloadLines = (items, products) => items.map((line) => ({
  productId: Number(line.productId),
  quantity: Number(line.quantity),
  unit: products.find((p) => String(p.id) === line.productId)?.defaultUnit || '',
}));

// ── Product line editor ─────────────────────────────────────────
// Shared by Create and Edit: a product picker, a quantity, the
// product's own unit shown read-only (the unit follows the product,
// not the line), and a remove button, plus "Add product line".
const ItemLinesEditor = ({ items, products, onChange }) => {
  const update = (index, patch) => onChange(items.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  return (
    <div className="space-y-2">
      <FieldLabel>Product lines</FieldLabel>
      {items.map((line, index) => (
        <div key={index} className="flex items-center gap-2">
          <Select value={line.productId || undefined} onValueChange={(v) => update(index, { productId: v })}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Select a product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="number" min="0" step="any" className="w-24"
            value={line.quantity}
            onChange={(e) => update(index, { quantity: e.target.value })}
            placeholder="Qty" aria-label={`Quantity for line ${index + 1}`}
          />
          <span className="w-12 shrink-0 text-sm text-muted-foreground">
            {products.find((p) => String(p.id) === line.productId)?.defaultUnit || ''}
          </span>
          <Button
            type="button" variant="ghost" size="icon-sm"
            onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label="Remove line"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { productId: '', quantity: '' }])}>
        <Plus /> Add product line
      </Button>
    </div>
  );
};

// ── Generate this week's slips ─────────────────────────────────
// `onGenerated(dispatchDate)` — the list moves to that date's week.
export function GenerateSlipsForm({ onGenerated, onDone }) {
  const [form, setForm] = useState({ dispatchDate: todaySast(), cohort: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await generateSlips(form));
      await onGenerated(form.dispatchDate);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Generate this week's slips</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Creates one slip per approved, active beneficiary in the chosen cohort. Safe to
          run twice: it skips any centre that already has a slip for that date.
        </p>
        {error ? <ErrorBanner message={error} /> : null}
        {result ? (
          <SuccessBanner
            message={
              `${result.created} slip(s) created.` +
              (result.emptySlips?.length
                ? ` ${result.emptySlips.length} had no lines. Check that centre's order first.`
                : '')
            }
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="gen-date">Dispatch date</FieldLabel>
            <Input
              id="gen-date" type="date" value={form.dispatchDate}
              onChange={(e) => setForm((f) => ({ ...f, dispatchDate: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gen-cohort">Cohort</FieldLabel>
            <CohortSelect id="gen-cohort" value={form.cohort} onChange={(v) => setForm((f) => ({ ...f, cohort: v }))} />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Button type="button" onClick={run} disabled={busy || !form.dispatchDate || !form.cohort}>
            {busy ? 'Generating' : 'Generate slips'}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>Done</Button>
        </Field>
      </CardContent>
    </Card>
  );
}

// ── Create a new slip ──────────────────────────────────────────
// For a late registration, a correction, or a make-up delivery.
// `onCreated(dispatchDate)` — the list moves to that date's week.
export function CreateSlipForm({ beneficiaries, products, onCreated, onCancel }) {
  const [form, setForm] = useState({
    ecdId: '', dispatchDate: todaySast(), cohort: '', force: false,
    // manualItems off by default keeps the original behaviour: the
    // server pulls this ECD's standing order. Switching it on lets a
    // manager type or calculate the lines themselves.
    manualItems: false, mealsToServe: '', items: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Turning manual lines on seeds every product that has a meals-to-
  // serve ratio, and defaults meals-to-serve to this beneficiary's own
  // registered count — a starting point to adjust, not a final answer.
  const toggleManualItems = () => {
    setForm((f) => {
      if (f.manualItems) return { ...f, manualItems: false, items: [] };
      const beneficiary = beneficiaries.find((b) => String(b.id) === f.ecdId);
      return {
        ...f,
        manualItems: true,
        mealsToServe: f.mealsToServe || (beneficiary?.childCount != null ? String(beneficiary.childCount) : ''),
        items: products.filter((p) => p.quantityPerMeal != null).map((p) => ({ productId: String(p.id), quantity: '' })),
      };
    });
  };

  // Recomputes every line that has a ratio; a line added by hand has
  // nothing to calculate from and is left alone.
  const applyMealsToServe = (value) => {
    setForm((f) => {
      const meals = Number(value);
      const items = Number.isFinite(meals) && meals > 0
        ? f.items.map((line) => {
            const product = products.find((p) => String(p.id) === line.productId);
            if (!product?.quantityPerMeal) return line;
            return { ...line, quantity: String(Math.round(meals * product.quantityPerMeal * 100) / 100) };
          })
        : f.items;
      return { ...f, mealsToServe: value, items };
    });
  };

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const items = form.manualItems
        ? toPayloadLines(form.items.filter((l) => l.productId && l.quantity && Number(l.quantity) > 0), products)
        : undefined;
      await createSlip({ ...form, ecdId: Number(form.ecdId), items });
      await onCreated(form.dispatchDate);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Create a new slip</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          For a late registration, a correction, or a make-up delivery outside a
          beneficiary's normal rotation.
        </p>
        {error ? <ErrorBanner message={error} /> : null}

        <Field>
          <FieldLabel htmlFor="adhoc-ecd">Beneficiary</FieldLabel>
          <Select value={form.ecdId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, ecdId: v }))}>
            <SelectTrigger id="adhoc-ecd"><SelectValue placeholder="Select a beneficiary" /></SelectTrigger>
            <SelectContent>
              {beneficiaries.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}{!b.approvedAt ? ' (unapproved)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Only approved, active beneficiaries can actually receive a slip.</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="adhoc-date">Dispatch date</FieldLabel>
            <Input
              id="adhoc-date" type="date" value={form.dispatchDate}
              onChange={(e) => setForm((f) => ({ ...f, dispatchDate: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="adhoc-cohort">Cohort</FieldLabel>
            <CohortSelect id="adhoc-cohort" value={form.cohort} onChange={(v) => setForm((f) => ({ ...f, cohort: v }))} />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Checkbox
            id="adhoc-force" checked={form.force}
            onCheckedChange={(v) => setForm((f) => ({ ...f, force: Boolean(v) }))}
          />
          <FieldLabel htmlFor="adhoc-force" className="font-normal">
            This is a deliberate make-up delivery outside the normal rotation
          </FieldLabel>
        </Field>

        <Field orientation="horizontal">
          <Checkbox id="adhoc-manual-items" checked={form.manualItems} onCheckedChange={toggleManualItems} />
          <FieldLabel htmlFor="adhoc-manual-items" className="font-normal">
            Set the product lines and quantities for this slip myself
          </FieldLabel>
        </Field>
        <FieldDescription>
          Leave this unchecked to pull the standard product list from the beneficiary's
          standing order, same as before.
        </FieldDescription>

        {form.manualItems ? (
          <>
            <Field>
              <FieldLabel htmlFor="adhoc-meals">Meals to serve</FieldLabel>
              <Input
                id="adhoc-meals" type="number" min="0" step="1" className="w-32"
                value={form.mealsToServe} onChange={(e) => applyMealsToServe(e.target.value)}
              />
              <FieldDescription>
                Calculates each product's quantity from this centre's per-meal ratio. Every line
                stays editable below, so adjust anything by hand before creating the slip.
              </FieldDescription>
            </Field>
            <ItemLinesEditor items={form.items} products={products} onChange={(items) => setForm((f) => ({ ...f, items }))} />
          </>
        ) : null}

        <Field orientation="horizontal">
          <Button
            type="button" onClick={run}
            disabled={busy || !form.ecdId || !form.dispatchDate || !form.cohort || (form.manualItems && linesInvalid(form.items))}
          >
            {busy ? 'Creating' : 'Create slip'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        </Field>
      </CardContent>
    </Card>
  );
}

// ── Edit a slip still on the floor ─────────────────────────────
// Pre-fills from the slip as it is now — editSlip's `items` fully
// replaces the line list, so the form starts from exactly what's there.
// `onSaved(dispatchDate)` — the list moves to that date's week.
export function EditSlipForm({ slip, products, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    dispatchDate: slip.dispatch_date_iso ?? String(slip.dispatch_date ?? '').slice(0, 10),
    cohort: slip.cohort,
    force: false,
    items: (slip.items || []).map((item) => ({
      productId: String(item.product_id),
      quantity: String(item.required_quantity),
    })),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      await editSlip(slip.id, {
        dispatchDate: form.dispatchDate,
        cohort: form.cohort,
        force: form.force,
        items: toPayloadLines(form.items, products),
      });
      await onSaved(form.dispatchDate);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Edit slip — {slip.ecd_name}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Only while this pallet is still on the floor, unclaimed — once someone picks it up, editing locks.
        </p>
        {error ? <ErrorBanner message={error} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="edit-date">Dispatch date</FieldLabel>
            <Input
              id="edit-date" type="date" value={form.dispatchDate}
              onChange={(e) => setForm((f) => ({ ...f, dispatchDate: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-cohort">Cohort</FieldLabel>
            <CohortSelect id="edit-cohort" value={form.cohort} onChange={(v) => setForm((f) => ({ ...f, cohort: v }))} />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Checkbox
            id="edit-force" checked={form.force}
            onCheckedChange={(v) => setForm((f) => ({ ...f, force: Boolean(v) }))}
          />
          <FieldLabel htmlFor="edit-force" className="font-normal">
            This is a deliberate change outside the normal rotation
          </FieldLabel>
        </Field>

        <ItemLinesEditor items={form.items} products={products} onChange={(items) => setForm((f) => ({ ...f, items }))} />

        <Field orientation="horizontal">
          <Button
            type="button" onClick={run}
            disabled={busy || !form.dispatchDate || !form.cohort || linesInvalid(form.items)}
          >
            {busy ? 'Saving' : 'Save changes'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        </Field>
      </CardContent>
    </Card>
  );
}
