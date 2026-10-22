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

  const add = async (event) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const created = await linkBarcode(product.id, { code, unitsPerScan: Number(units) });
      setRows((list) => [...(list ?? []).filter((r) => r.id !== created.id), created]);
      setCode(''); setUnits('1');
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
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-start">
          <Field data-invalid={codeInvalid || undefined}>
            <FieldLabel htmlFor="product-barcode-code">Barcode</FieldLabel>
            <Input
              id="product-barcode-code" value={code} autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={codeInvalid || undefined}
            />
            {codeInvalid
              ? <FieldError>Not a barcode the system can read. Check the numbers.</FieldError>
              : <FieldDescription>Scan it into this box or type the numbers.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor="product-barcode-units">Per scan</FieldLabel>
            <Input
              id="product-barcode-units" type="number" min="0" step="any" inputMode="decimal"
              value={units} onChange={(e) => setUnits(e.target.value)}
              aria-invalid={!unitsValid || undefined}
            />
          </Field>
          <Button type="submit" className="sm:mt-6" disabled={busy || !codeTyped || codeInvalid || !unitsValid}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Add barcode
          </Button>
        </form>
      ) : null}
    </section>
  );
}
