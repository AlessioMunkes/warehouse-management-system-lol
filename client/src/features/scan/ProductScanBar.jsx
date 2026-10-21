// ─────────────────────────────────────────────────────────────
// client/src/features/scan/ProductScanBar.jsx
//
// Scanning as a second way to log an item, beside choosing it by name.
// Receiving and donation intake both put this above their item list.
// Nothing about the list changes: a scan only does what typing the
// product's name and its count would have done.
//
// THREE WAYS IN, ONE PATH
//   the Barcode field   typed by hand, or "typed" by a USB or Bluetooth
//                       scanner, which sends the digits and Enter. The
//                       field keeps focus after each code, so a scanner
//                       can fire one box after another.
//   the camera          PalletScanner in its product mode.
//   either way          productCode.js normalises the code (a misread is
//                       answered here), the server says which product it
//                       is, and onMatch(match) applies it to the list.
//
// Reads are handled one at a time, in order. A camera can read two
// boxes faster than the server answers the first, and dropping the
// second would undercount.
//
// A CODE NOBODY HAS LINKED is the normal case for the first box of
// anything. The bar asks which product it is (from `linkChoices`, the
// lines already on screen, or a search of the catalogue when there are
// none), links it, and then counts it. From then on it is known.
//
// onMatch returns what to say about the scan: a string, or
// { tone: 'warn', text } when it could not be used (a product that is
// not on this order).
// ─────────────────────────────────────────────────────────────
import { useEffect, useId, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Actions, Button, ChoiceList, Notice, NumberField, TextField } from '../staff/StepPrimitives';
import { ProductMatchCombobox } from '../donation/ProductMatchComboBox';
import { lookupBarcode, linkBarcode } from '../../services/productBarcodeAPI';
import PalletScanner from './PalletScanner';
import { normaliseBarcode } from './productCode';

const NOT_A_BARCODE = 'That is not a barcode the system can read. Scan it again or type the numbers under the bars.';

const CAMERA_TROUBLE = {
  denied: 'The camera is blocked. Type the numbers under the bars instead.',
  noCamera: 'There is no camera on this device. Type the numbers under the bars instead.',
  failed: 'The camera could not start. Type the numbers under the bars instead.',
};

const asMessage = (said) => {
  if (!said) return null;
  if (typeof said === 'string') return { tone: 'info', text: said };
  return { tone: said.tone ?? 'info', text: said.text };
};

// ── Linking a code nobody knows yet ───────────────────────────
export function LinkBarcodePanel({ code, choices, onLinked, onCancel }) {
  const fieldId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [productId, setProductId] = useState(choices?.length === 1 ? choices[0].productId : null);
  const [productName, setProductName] = useState(choices?.length === 1 ? choices[0].label : '');
  const [units, setUnits] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const chosen = choices?.find((c) => String(c.productId) === String(productId));
  const unitsValid = Number(units) > 0;

  const link = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await linkBarcode(productId, { code, unitsPerScan: Number(units) });
      onLinked({
        productId,
        productName: chosen?.label ?? productName,
        defaultUnit: chosen?.unit ?? null,
        unitsPerScan: created.unitsPerScan,
        available: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stf-scan" aria-labelledby={`${fieldId}-title`}>
      <h3 className="stf-scan-title" id={`${fieldId}-title`}>New barcode</h3>
      <p className="stf-scan-hint">
        {code} is not linked to a product yet. Choose the product once and it is known from now on.
      </p>

      {choices ? (
        <ChoiceList
          legend="Which product"
          options={choices.map((c) => ({ value: c.productId, label: c.label, meta: c.meta }))}
          value={productId ?? ''}
          onChange={(value) => setProductId(Number(value))}
        />
      ) : (
        <div className="stf-field">
          <span className="stf-field-label">Which product</span>
          <ProductMatchCombobox
            value={productId}
            label={productName}
            onSelect={(id, name) => { setProductId(id); setProductName(name || ''); }}
          />
        </div>
      )}

      <NumberField
        id={`${fieldId}-units`}
        label="Units per scan"
        hint={`How many ${chosen?.unit || 'units'} one scan counts for. A box of 12 is 12.`}
        value={units}
        onChange={setUnits}
        flagged={!unitsValid}
      />

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <Actions row>
        <Button onClick={link} disabled={busy || !productId || !unitsValid}>
          {busy ? 'Linking' : 'Link and count'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Not now</Button>
      </Actions>
    </section>
  );
}

// ── The bar ───────────────────────────────────────────────────
export default function ProductScanBar({ onMatch, linkChoices, disabled = false }) {
  const fieldId = `stf-barcode-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [typed, setTyped] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTrouble, setCameraTrouble] = useState(null);
  const [message, setMessage] = useState(null);
  const [looking, setLooking] = useState(false);
  const [unknownCode, setUnknownCode] = useState(null);
  const inputRef = useRef(null);
  // One read at a time, in the order they came.
  const queue = useRef(Promise.resolve());
  // Codes already answered on this screen. Only matches are kept: an
  // unknown code may be linked a moment later.
  const known = useRef(new Map());
  // The latest handler, so a read queued before a re-render applies to
  // the list as it is now, not as it was.
  const latest = useRef({ onMatch });
  useEffect(() => { latest.current = { onMatch }; });

  const apply = (match) => setMessage(asMessage(latest.current.onMatch(match)));

  const handle = async (raw) => {
    const parsed = normaliseBarcode(raw);
    if (!parsed) { setMessage({ tone: 'warn', text: NOT_A_BARCODE }); return; }

    const cached = known.current.get(parsed.code);
    if (cached) { apply(cached); return; }

    setLooking(true);
    try {
      const { code, match } = await lookupBarcode(parsed.code);
      if (!match) {
        setUnknownCode(code);
        setMessage(null);
      } else if (!match.available) {
        setMessage({ tone: 'warn', text: `${match.productName} is no longer in the catalogue. Find the item by name instead.` });
      } else {
        known.current.set(code, match);
        apply(match);
      }
    } catch (err) {
      setMessage({ tone: 'warn', text: err.message });
    } finally {
      setLooking(false);
    }
  };

  const read = (raw) => {
    queue.current = queue.current.then(() => handle(raw)).catch(() => {});
    return queue.current;
  };

  const submitTyped = (event) => {
    event.preventDefault();
    const text = typed;
    setTyped('');
    inputRef.current?.focus();
    if (text.trim()) read(text);
  };

  const linked = (code, match) => {
    known.current.set(code, match);
    setUnknownCode(null);
    apply(match);
  };

  return (
    <div className="stf-scanbar">
      <form className="stf-scanbar-row" onSubmit={submitTyped}>
        <TextField
          id={fieldId}
          ref={inputRef}
          label="Barcode"
          hint="Scan, or type the numbers under the bars."
          value={typed}
          onChange={setTyped}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck="false"
          enterKeyHint="search"
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !typed.trim()}>Find</Button>
        <Button
          variant="secondary"
          onClick={() => { setCameraOpen((open) => !open); setCameraTrouble(null); }}
          aria-pressed={cameraOpen}
          disabled={disabled}
        >
          {cameraOpen ? <X size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
          {cameraOpen ? 'Close camera' : 'Use camera'}
        </Button>
      </form>

      {cameraOpen ? (
        cameraTrouble ? (
          <Notice tone="warn">{CAMERA_TROUBLE[cameraTrouble] ?? CAMERA_TROUBLE.failed}</Notice>
        ) : (
          <PalletScanner
            kind="product"
            label="Camera for barcodes"
            onCode={read}
            onUnavailable={setCameraTrouble}
          />
        )
      ) : null}

      {looking ? <p className="stf-scan-hint" role="status">Looking it up</p> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {unknownCode ? (
        <LinkBarcodePanel
          key={unknownCode}
          code={unknownCode}
          choices={linkChoices}
          onLinked={(match) => linked(unknownCode, match)}
          onCancel={() => setUnknownCode(null)}
        />
      ) : null}
    </div>
  );
}
