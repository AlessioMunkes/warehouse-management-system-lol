// ─────────────────────────────────────────────────────────────
// client/src/features/products/ProductBarcodeStart.jsx
//
// "Start from a barcode", above the Add product form. The admin scans
// or types the code on the pack; the server says whether a product
// already has it, and if not, what the public Open Food Facts database
// says it is (name, pack size, weight). That fills the form below as a
// suggestion to check, never a save, and the barcode is linked to the
// product once it is added.
//
// Only the barcode leaves the system (integrations/openFoodFacts.js).
// Most donated stock is not in the database, and the form works the
// same without it.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Loader2, ScanBarcode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { suggestProduct } from '@/services/productBarcodeAPI';
import { normaliseBarcode } from '@/features/scan/productCode';
import useCameraScan from '@/features/scan/useCameraScan';

const REASON = { size: 'same pack size', name: 'same name', kind: 'same kind of food' };

// What the form can take from a suggestion. Counted packs default to
// "each": a tin of beans is counted, not weighed.
const toSeed = (s) => ({
  name: s.name ?? '',
  weightKg: s.weightKg ?? '',
  category: s.category ?? '',
  defaultUnit: 'each',
});

export default function ProductBarcodeStart({ onSeed, onCode }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  const lookUp = async (value) => {
    if (!String(value ?? '').trim()) { setError('Scan or type the barcode first.'); return; }
    const parsed = normaliseBarcode(value);
    if (!parsed) { setError('Not a barcode the system can read. Check the numbers.'); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      const { code: stored, linkedTo, suggestion, matches } = await suggestProduct(parsed.code);
      if (linkedTo) {
        onCode(null);
        setError(`This barcode is already on ${linkedTo.productName}.`);
      } else if (matches?.length) {
        // Another brand of something already stocked: one stock item
        // with two barcodes, not two products with one each.
        onCode(stored);
        if (suggestion) onSeed(toSeed(suggestion));
        const best = matches[0];
        setNote(`This looks like ${best.productName}, already in the catalogue (${best.reasons.map((r) => REASON[r]).join(', ')}). `
          + 'If it is the same item, add this barcode to it from its panel instead of adding a new product.');
      } else {
        onCode(stored);
        if (suggestion) {
          onSeed(toSeed(suggestion));
          setNote('Filled in from Open Food Facts. Check it before you add the product.');
        } else {
          setNote('Open Food Facts does not know this barcode. Fill in the product below. The barcode is linked when you add it.');
        }
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  // A camera read fills the box and looks it up straight away: holding
  // the pack up was the whole of the asking.
  const camera = useCameraScan((text) => {
    const value = normaliseBarcode(text)?.code ?? text;
    setCode(value);
    setError(null);
    lookUp(value);
  });

  return (
    <form onSubmit={(event) => { event.preventDefault(); lookUp(code); }} className="mb-6">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="product-start-barcode">Start from a barcode</FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Input
            id="product-start-barcode" value={code} autoComplete="off" className="min-w-0 flex-1 basis-48"
            onChange={(e) => { setCode(e.target.value); setError(null); }}
          />
          {camera.button}
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ScanBarcode />}
            Look up
          </Button>
        </div>
        {error ? <FieldError>{error}</FieldError>
          : <FieldDescription>{note ?? 'Optional. Scan the pack with the camera or a USB scanner to fill in its details.'}</FieldDescription>}
        {camera.view}
      </Field>
    </form>
  );
}
