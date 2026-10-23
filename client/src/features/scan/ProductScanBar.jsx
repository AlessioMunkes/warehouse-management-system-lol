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
//   either way          useBarcodeReader.js: the code is normalised, the
//                       product found (offline too, from the phone's copy
//                       of every link), and onMatch(match, label) applies
//                       it to the list. `label` carries a GS1 case
//                       label's use-by date and batch.
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
import { linkBarcode, matchBarcode } from '../../services/productBarcodeAPI';
import PalletScanner from './PalletScanner';
import useBarcodeReader from './useBarcodeReader';
import ScanFlash from './ScanFlash';
import { useT } from '../../translations';

const CAMERA_TROUBLE = ['denied', 'noCamera', 'failed'];

// ── Linking a code nobody knows yet ───────────────────────────
// The closest stock item is looked for first (matchBarcode: what Open
// Food Facts says the pack is, against the catalogue). When there is
// one, it is chosen, with the reasons, for the person to check: Brand
// B's beans go on the stock item that already has Brand A's. When
// there is none, or no signal, the panel is exactly as it was. On a
// screen with its own short list (`choices`: the order's or the
// pallet's lines), only a match on that list is offered.
//
// What the pack IS is said whenever Open Food Facts knows it, matched
// or not. And when it is clearly a stock item that is NOT on this
// order or pallet (Koo baked beans scanned on a Samp order), the panel
// says that, and nothing is chosen for it: a one-line order used to
// arrive with its only line already ticked, one tap from linking a
// beans barcode to Samp. `where` ('receiving' | 'packing') picks the
// words.
export function LinkBarcodePanel({ code, choices, onLinked, onCancel, where = null }) {
  const t = useT();
  const fieldId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [productId, setProductId] = useState(choices?.length === 1 ? choices[0].productId : null);
  const [productName, setProductName] = useState(choices?.length === 1 ? choices[0].label : '');
  const [units, setUnits] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(true);
  const [suggested, setSuggested] = useState(null);   // { food, matches }
  const [food, setFood] = useState(null);             // what the pack is, matched or not
  const [elsewhere, setElsewhere] = useState(null);   // the stock item it is, not on this list

  // The list the panel opened with: a match is looked for once per code.
  const openingChoices = useRef(choices);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => matchBarcode(code))
      .then((result) => {
        if (cancelled || !result) return;
        setFood(result.food ?? null);
        const all = result.matches ?? [];
        if (!all.length) return;
        const list = openingChoices.current;
        const onList = (m) => !list || list.some((c) => String(c.productId) === String(m.productId));
        // Its best match is something this order or pallet does not
        // have: say so, and choose nothing.
        if (!onList(all[0])) {
          setElsewhere(all[0]);
          setProductId(null);
          setProductName('');
          return;
        }
        const usable = all.filter(onList);
        setSuggested({ food: result.food, matches: usable });
        setProductId((current) => current ?? usable[0].productId);
        setProductName((current) => current || usable[0].productName);
      })
      .catch(() => { /* no signal or no answer: the panel as it always was */ })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [code]);

  const why = (m) => m.reasons.map((r) => t(`barcode.match.reason.${r}`)).join(', ');
  const best = suggested?.matches[0] ?? null;
  const pickMatch = (m) => { setProductId(m.productId); setProductName(m.productName); };

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

      {checking ? <p className="stf-scan-hint" role="status">{t('barcode.match.checking')}</p> : null}
      {elsewhere ? (
        <Notice tone="warn">
          {food?.name ? `${t('barcode.match.looksLike', { name: food.name })} ` : ''}
          {t(where === 'packing' ? 'barcode.match.notOnPallet' : 'barcode.match.notOnOrder', { item: elsewhere.productName })}
        </Notice>
      ) : !best && food?.name ? (
        <Notice>{t('barcode.match.looksLike', { name: food.name })}</Notice>
      ) : null}
      {best ? (
        <Notice
          actions={!choices && suggested.matches.length > 1 ? suggested.matches.slice(1).map((m) => (
            <Button key={m.productId} variant="secondary" onClick={() => pickMatch(m)}>
              {t('barcode.match.orThis', { item: m.productName })}
            </Button>
          )) : null}
        >
          {suggested.food?.name ? `${t('barcode.match.looksLike', { name: suggested.food.name })} ` : ''}
          {t(choices ? 'barcode.match.closest' : 'barcode.match.closestPick', { item: best.productName, why: why(best) })}
        </Notice>
      ) : null}

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
// `screen` and `referenceId` say where the scan was, for the record
// useBarcodeReader keeps (receiving and an order id, packing and a
// slip id...).
export default function ProductScanBar({ onMatch, linkChoices, disabled = false, screen = null, referenceId = null }) {
  const t = useT();
  const fieldId = `stf-barcode-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [typed, setTyped] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTrouble, setCameraTrouble] = useState(null);
  const inputRef = useRef(null);
  const { read, linked, message, looking, unknownCode, dismissUnknown, scanned } = useBarcodeReader({ onMatch, screen, referenceId });

  // The camera library is fetched the first time the camera opens, which
  // made the first open slow. Fetched quietly once the page is idle
  // instead, so tapping Use camera starts the camera straight away.
  useEffect(() => {
    if (typeof window === 'undefined' || !('requestIdleCallback' in window)) return undefined;
    const id = window.requestIdleCallback(() => { import('html5-qrcode').catch(() => {}); });
    return () => window.cancelIdleCallback?.(id);
  }, []);

  const submitTyped = (event) => {
    event.preventDefault();
    const text = typed;
    setTyped('');
    inputRef.current?.focus();
    if (text.trim()) read(text);
  };

  return (
    <div className="stf-scanbar">
      <ScanFlash signal={scanned} label={t('barcode.scanned')} />
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
            torchLabel={t('barcode.torch')}
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
          where={screen}
          onLinked={(match) => linked(unknownCode, match)}
          onCancel={dismissUnknown}
        />
      ) : null}
    </div>
  );
}
