// ─────────────────────────────────────────────────────────────
// client/src/features/products/PrintLabels.jsx
//
// Barcode stickers for a stock item that has none of its own: loose
// produce in crates, bulk sacks, anything packed in the warehouse. On
// the admin's product panel (Products) and the manager's stock panel
// (Inventory), each on their own screen.
//
// How much one label stands for is chosen here, in the item's own unit:
// 1 crate, a 10 kg sack. That gives the item its own code
// (ownLabelCode in productCode.js: LOL4N1 is one crate of product 4,
// LOL12K10000 a 10 kg sack of product 12), which is linked to the item
// with that amount as its units per scan before the sheet opens, so
// a sticker scanned at receiving, packing or a count adds exactly what
// it says. Printing the same size again reuses the same code.
//
// Weighed and poured items (kg, l, g, ml) can be any amount; counted
// ones (each, crate, bag, box, punnet) a whole number.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { linkBarcode } from '@/services/productBarcodeAPI';
import { ownLabelCode } from '@/features/scan/productCode';
import {
  openLabelSheet, openBlankForSheet, longDate, todaySast, PER_PAGE, MAX_LABELS,
} from '@/features/labels/labelSheetPdf';

const WEIGHED = ['kg', 'l', 'g', 'ml'];

// "1 crate", "6 items", "10 kg".
const amountText = (qty, unit) => {
  if (WEIGHED.includes(unit)) return `${qty} ${unit}`;
  if (unit === 'each') return qty === 1 ? '1 item' : `${qty} items`;
  return `${qty} ${unit}${qty === 1 ? '' : 's'}`;
};

export default function PrintLabels({ product, onLinked }) {
  const unit = product.defaultUnit || product.unit || 'each';
  const weighed = WEIGHED.includes(unit);
  const [amount, setAmount] = useState('1');
  const [count, setCount] = useState(String(PER_PAGE));
  const [useBy, setUseBy] = useState(Boolean(product.isPerishable));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const qty = Number(amount);
  const howMany = Number(count);
  const code = ownLabelCode(product.id, qty, unit);
  const amountProblem = !code
    ? (weighed ? 'More than 0.' : `A whole number of ${unit === 'each' ? 'items' : `${unit}s`}, 1 or more.`)
    : null;
  const countProblem = Number.isInteger(howMany) && howMany >= 1 && howMany <= MAX_LABELS
    ? null : `From 1 to ${MAX_LABELS} labels.`;

  const print = async (event) => {
    event.preventDefault();
    setTried(true);
    setDone(null);
    if (amountProblem || countProblem) return;
    // Opened on the click: a window opened after the server answers is
    // blocked as a pop-up.
    const win = openBlankForSheet();
    setBusy(true);
    setError(null);
    try {
      const linked = await linkBarcode(product.id, { code, unitsPerScan: qty });
      onLinked?.(linked);
      const { opened } = openLabelSheet({
        title: product.name,
        useBy,
        labels: [{ code, count: howMany, caption: `${amountText(qty, unit)} · Printed ${longDate(todaySast())}` }],
      }, win);
      if (opened) setDone(`${howMany} ${howMany === 1 ? 'label' : 'labels'} for ${amountText(qty, unit)}, code ${code}.`);
      else setError('The labels could not open. Allow pop-ups for this site and try again.');
    } catch (err) {
      win?.close?.();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 space-y-3" aria-labelledby={`print-labels-${product.id}`}>
      <h3 id={`print-labels-${product.id}`} className="text-sm font-semibold">Print labels</h3>
      <p className="text-sm text-muted-foreground">
        Barcode stickers for loose stock. Scanning one counts the amount it says.
      </p>
      <form onSubmit={print} noValidate className="grid grid-cols-2 items-start gap-4">
        <Field data-invalid={(tried && amountProblem) || undefined}>
          <FieldLabel htmlFor={`label-amount-${product.id}`}>Each label is</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`label-amount-${product.id}`} type="number" min="0" step={weighed ? 'any' : '1'} inputMode="decimal"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              aria-invalid={(tried && amountProblem) || undefined}
            />
            <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>
          </div>
          {tried && amountProblem ? <FieldError>{amountProblem}</FieldError> : null}
        </Field>
        <Field data-invalid={(tried && countProblem) || undefined}>
          <FieldLabel htmlFor={`label-count-${product.id}`}>How many labels</FieldLabel>
          <Input
            id={`label-count-${product.id}`} type="number" min="1" max={MAX_LABELS} step="1" inputMode="numeric"
            value={count} onChange={(e) => setCount(e.target.value)}
            aria-invalid={(tried && countProblem) || undefined}
          />
          {tried && countProblem
            ? <FieldError>{countProblem}</FieldError>
            : <FieldDescription>{PER_PAGE} fit on one A4 sheet.</FieldDescription>}
        </Field>
        <Field orientation="horizontal" className="col-span-2">
          <Checkbox
            id={`label-useby-${product.id}`} checked={useBy}
            onCheckedChange={(checked) => setUseBy(checked === true)}
          />
          <FieldLabel htmlFor={`label-useby-${product.id}`} className="font-normal">
            Add a line to write the use-by date
          </FieldLabel>
        </Field>
        <div className="col-span-2 space-y-2">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Printer />}
            Print labels
          </Button>
          {error ? <FieldError>{error}</FieldError> : null}
          {done ? <p role="status" className="text-sm text-muted-foreground">{done}</p> : null}
        </div>
      </form>
    </section>
  );
}
