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

  const look = async (event) => {
    event.preventDefault();
    const parsed = normaliseBarcode(code);
    if (!parsed) { setError('Not a barcode the system can read. Check the numbers.'); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      const { code: stored, linkedTo, suggestion } = await suggestProduct(parsed.code);
      if (linkedTo) {
        onCode(null);
        setError(`This barcode is already on ${linkedTo.productName}.`);
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

  return (
    <form onSubmit={look} className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="product-start-barcode">Start from a barcode</FieldLabel>
        <Input
          id="product-start-barcode" value={code} autoComplete="off"
          onChange={(e) => { setCode(e.target.value); setError(null); }}
        />
        {error ? <FieldError>{error}</FieldError>
          : <FieldDescription>{note ?? 'Optional. Scan the pack to fill in its details.'}</FieldDescription>}
      </Field>
      <Button type="submit" variant="outline" className="sm:mt-6" disabled={busy || !code.trim()}>
        {busy ? <Loader2 className="animate-spin" /> : <ScanBarcode />}
        Look up
      </Button>
    </form>
  );
}
