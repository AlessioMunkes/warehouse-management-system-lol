// ─────────────────────────────────────────────────────────────
// client/src/features/products/ProductBarcodes.jsx
//
// The barcodes linked to one product, in its panel on Products.
//
// Most links are made at the bay: a worker scans a box nobody has
// linked yet and says which product it is (features/scan/
// ProductScanBar.jsx). This is where an admin sees them, adds one
// ahead of a delivery, and removes a wrong one. Everyone else who can
// open the panel sees the list and nothing to press, matching
// productBarcode.routes.js: removing is admin only.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { listBarcodes, linkBarcode, removeBarcode } from '@/services/productBarcodeAPI';
import { normaliseBarcode } from '@/features/scan/productCode';
import useCameraScan from '@/features/scan/useCameraScan';

export default function ProductBarcodes({ product, canManage, onChanged }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [code, setCode] = useState('');
  const [units, setUnits] = useState('1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listBarcodes(product.id)
      .then((list) => { if (!cancelled) setRows(list); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [product.id]);

  const codeTyped = code.trim() !== '';
  const codeInvalid = codeTyped && !normaliseBarcode(code);
  const unitsValid = Number(units) > 0;
  // Pressed with something missing: say what, beside the field, rather
  // than leave a greyed-out button nobody can explain.
  const [tried, setTried] = useState(false);
  // The camera fills the box with what it read, in its stored form (a
  // GS1 case label's GTIN, a UPC as its EAN-13). The admin then checks
  // Per scan and adds it.
  const camera = useCameraScan((text) => {
    setCode(normaliseBarcode(text)?.code ?? text);
    setTried(false);
  });
  const codeMissing = tried && !codeTyped;
  const unitsWrong = tried && !unitsValid;

  const add = async (event) => {
    event.preventDefault();
    setTried(true);
    if (!codeTyped || codeInvalid || !unitsValid) return;
    setBusy(true); setError(null);
    try {
      const created = await linkBarcode(product.id, { code, unitsPerScan: Number(units) });
      setRows((list) => [...(list ?? []).filter((r) => r.id !== created.id), created]);
      setCode(''); setUnits('1'); setTried(false);
      onChanged?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const remove = async (row) => {
    setBusy(true); setError(null);
    try {
      await removeBarcode(product.id, row.id);
      setRows((list) => (list ?? []).filter((r) => r.id !== row.id));
      onChanged?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <section className="mt-6 space-y-3" aria-labelledby="product-barcodes-title">
      <h3 id="product-barcodes-title" className="text-sm font-semibold">Barcodes</h3>
      {error ? <FieldError>{error}</FieldError> : null}

      {rows === null && !error ? (
        <p className="text-sm text-muted-foreground">Loading</p>
      ) : rows?.length ? (
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              <span className="font-mono">{row.code}</span>
              <span className="text-muted-foreground">
                {row.unitsPerScan === 1 ? '1 per scan' : `${row.unitsPerScan} per scan`}
                {row.supplierName ? ` · ${row.supplierName}` : ''}
              </span>
              {canManage ? (
                <Button
                  type="button" variant="ghost" size="sm" className="ml-auto"
                  onClick={() => remove(row)} disabled={busy}
                  aria-label={`Remove barcode ${row.code}`}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : rows ? (
        <p className="text-sm text-muted-foreground">No barcode linked. Items can still be found by name.</p>
      ) : null}

      {canManage ? (
        <form onSubmit={add} className="grid grid-cols-[8rem_auto] items-start gap-4">
          {/* The code on its own row: the panel is narrow, and a code is long. */}
          <Field className="col-span-2" data-invalid={codeInvalid || codeMissing || undefined}>
            <FieldLabel htmlFor="product-barcode-code">Barcode</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="product-barcode-code" value={code} autoComplete="off"
                onChange={(e) => setCode(e.target.value)}
                aria-invalid={codeInvalid || codeMissing || undefined}
              />
              {camera.button}
            </div>
            {codeInvalid
              ? <FieldError>Not a barcode the system can read. Check the numbers.</FieldError>
              : codeMissing
                ? <FieldError>Scan or type the barcode first.</FieldError>
                : <FieldDescription>Use the camera, a USB scanner in this box, or type the numbers.</FieldDescription>}
            {camera.view}
          </Field>
          <Field data-invalid={unitsWrong || undefined}>
            <FieldLabel htmlFor="product-barcode-units">Per scan</FieldLabel>
            <Input
              id="product-barcode-units" type="number" min="0" step="any" inputMode="decimal"
              value={units} onChange={(e) => setUnits(e.target.value)}
              aria-invalid={unitsWrong || undefined}
            />
            {unitsWrong ? <FieldError>More than 0.</FieldError> : null}
          </Field>
          <Button type="submit" className="mt-6 justify-self-start" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Add barcode
          </Button>
        </form>
      ) : null}
    </section>
  );
}
