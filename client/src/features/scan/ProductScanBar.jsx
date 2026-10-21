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
// not on this order). The bar's own words are in translations/
// messages.js (barcode.*), because packing is read in three languages.
// ─────────────────────────────────────────────────────────────
import { useEffect, useId, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Actions, Button, ChoiceList, Notice, NumberField, TextField } from '../staff/StepPrimitives';
import { ProductMatchCombobox } from '../donation/ProductMatchComboBox';
import { lookupBarcode, linkBarcode } from '../../services/productBarcodeAPI';
import PalletScanner from './PalletScanner';
import { normaliseBarcode } from './productCode';
import { useT } from '../../translations';

const CAMERA_TROUBLE = ['denied', 'noCamera', 'failed'];

const asMessage = (said) => {
  if (!said) return null;
  if (typeof said === 'string') return { tone: 'info', text: said };
  return { tone: said.tone ?? 'info', text: said.text };
};

// ── Linking a code nobody knows yet ───────────────────────────
export function LinkBarcodePanel({ code, choices, onLinked, onCancel }) {
  const t = useT();
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
      <h3 className="stf-scan-title" id={`${fieldId}-title`}>{t('barcode.new.title')}</h3>
      <p className="stf-scan-hint">{t('barcode.new.body', { code })}</p>

      {choices ? (
        <ChoiceList
          legend={t('barcode.new.which')}
          options={choices.map((c) => ({ value: c.productId, label: c.label, meta: c.meta }))}
          value={productId ?? ''}
          onChange={(value) => setProductId(Number(value))}
        />
      ) : (
        <div className="stf-field">
          <span className="stf-field-label">{t('barcode.new.which')}</span>
          <ProductMatchCombobox
            value={productId}
            label={productName}
            onSelect={(id, name) => { setProductId(id); setProductName(name || ''); }}
          />
        </div>
      )}

      <NumberField
        id={`${fieldId}-units`}
        label={t('barcode.new.units')}
        hint={t('barcode.new.unitsHint')}
        value={units}
        onChange={setUnits}
        flagged={!unitsValid}
      />

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <Actions row>
        <Button onClick={link} disabled={busy || !productId || !unitsValid}>
          {busy ? t('barcode.new.linking') : t('barcode.new.link')}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t('barcode.new.notNow')}</Button>
      </Actions>
    </section>
  );
}

// ── The bar ───────────────────────────────────────────────────
export default function ProductScanBar({ onMatch, linkChoices, disabled = false }) {
  const t = useT();
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
    if (!parsed) { setMessage({ tone: 'warn', text: t('barcode.notBarcode') }); return; }

    const cached = known.current.get(parsed.code);
    if (cached) { apply(cached); return; }

    setLooking(true);
    try {
      const { code, match } = await lookupBarcode(parsed.code);
      if (!match) {
        setUnknownCode(code);
        setMessage(null);
      } else if (!match.available) {
        setMessage({ tone: 'warn', text: t('barcode.gone', { name: match.productName }) });
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
          label={t('barcode.label')}
          hint={t('barcode.hint')}
          value={typed}
          onChange={setTyped}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck="false"
          enterKeyHint="search"
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !typed.trim()}>{t('barcode.find')}</Button>
        <Button
          variant="secondary"
          onClick={() => { setCameraOpen((open) => !open); setCameraTrouble(null); }}
          aria-pressed={cameraOpen}
          disabled={disabled}
        >
          {cameraOpen ? <X size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
          {cameraOpen ? t('barcode.closeCamera') : t('barcode.useCamera')}
        </Button>
      </form>

      {cameraOpen ? (
        cameraTrouble ? (
          <Notice tone="warn">{t(`barcode.${CAMERA_TROUBLE.includes(cameraTrouble) ? cameraTrouble : 'failed'}`)}</Notice>
        ) : (
          <PalletScanner
            kind="product"
            label={t('barcode.cameraLabel')}
            onCode={read}
            onUnavailable={setCameraTrouble}
          />
        )
      ) : null}

      {looking ? <p className="stf-scan-hint" role="status">{t('barcode.looking')}</p> : null}
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
