// ─────────────────────────────────────────────────────────────
// client/src/features/scan/useBarcodeReader.js
//
// What happens after a barcode is read, for every screen that scans
// products: ProductScanBar on the floor (Receiving, donations, packing)
// and the manager's area count, which has its own look.
//
//   1  productCode.js normalises it. A misread is answered here.
//   2  The product it names, from the first of:
//        codes this screen has already answered
//        the phone's own copy of every link (getAllBarcodes), so a
//        bay with no signal can still scan
//        the server
//   3  onMatch(match, label) applies it to the screen's list and says
//      what happened. `label` is what a GS1 case label carried
//      ({ useBy, batch }), or nulls.
//   4  A record of what the scan was (counted, not on the list, ...)
//      goes to the server for the "caught by scanning" report, when
//      the screen says where it is (`screen`).
//
// Reads are handled one at a time, in order: a camera can read two
// boxes faster than the server answers the first, and dropping the
// second would undercount.
//
// onMatch returns a string (it counted), or { tone: 'warn', text }
// (a real product the list does not want), with an optional `outcome`
// for the record when it is neither ('already_done').
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { getAllBarcodes, lookupBarcode, recordScan } from '../../services/productBarcodeAPI';
import { normaliseBarcode } from './productCode';
import { useT } from '../../translations';

// ── The phone's copy of every link ────────────────────────────
// Shared by every scanning screen and refreshed at most every few
// minutes. readCache.js keeps the last answer on the device, so the
// copy survives a reload with no signal.
const REFRESH_MS = 5 * 60 * 1000;
const shared = { map: null, at: 0, loading: null };

export const loadKnownBarcodes = () => {
  if (shared.loading) return shared.loading;
  if (shared.map && Date.now() - shared.at < REFRESH_MS) return Promise.resolve(shared.map);
  shared.loading = Promise.resolve()
    .then(() => getAllBarcodes())
    .then((rows) => {
      shared.map = new Map((rows ?? []).map((r) => [r.code, r]));
      shared.at = Date.now();
      return shared.map;
    })
    .catch(() => shared.map)
    .finally(() => { shared.loading = null; });
  return shared.loading;
};

// A link made on this phone is known to it straight away.
export const rememberBarcode = (code, match) => {
  if (!shared.map) shared.map = new Map();
  shared.map.set(code, { code, ...match });
};

// For tests.
export const forgetKnownBarcodes = () => { shared.map = null; shared.at = 0; shared.loading = null; };

const asMessage = (said) => {
  if (!said) return null;
  if (typeof said === 'string') return { tone: 'info', text: said };
  return { tone: said.tone ?? 'info', text: said.text };
};

const outcomeOf = (said) => {
  if (said && typeof said === 'object' && said.outcome) return said.outcome;
  return said && typeof said === 'object' && said.tone === 'warn' ? 'not_on_list' : 'counted';
};

export default function useBarcodeReader({ onMatch, screen = null, referenceId = null }) {
  const t = useT();
  const [message, setMessage] = useState(null);
  const [looking, setLooking] = useState(false);
  const [unknownCode, setUnknownCode] = useState(null);
  const queue = useRef(Promise.resolve());
  const known = useRef(new Map());
  // The latest handler and context, so a read queued before a
  // re-render applies to the screen as it is now.
  const latest = useRef({ onMatch, screen, referenceId });
  useEffect(() => { latest.current = { onMatch, screen, referenceId }; });

  useEffect(() => { loadKnownBarcodes(); }, []);

  const record = (outcome, productId = null) => {
    const { screen: where, referenceId: ref } = latest.current;
    if (!where) return;
    Promise.resolve()
      .then(() => recordScan({ screen: where, outcome, productId, referenceId: ref ?? null }))
      .catch(() => {});
  };

  const apply = (match, label) => {
    const said = latest.current.onMatch(match, label);
    setMessage(asMessage(said));
    record(outcomeOf(said), match.productId);
  };

  const handle = async (raw) => {
    const parsed = normaliseBarcode(raw);
    if (!parsed) {
      setMessage({ tone: 'warn', text: t('barcode.notBarcode') });
      record('misread');
      return;
    }
    const label = { useBy: parsed.gs1?.useBy ?? null, batch: parsed.gs1?.batch ?? null };

    const mine = known.current.get(parsed.code) ?? shared.map?.get(parsed.code);
    if (mine) {
      known.current.set(parsed.code, mine);
      apply(mine, label);
      return;
    }

    setLooking(true);
    try {
      const { code, match } = await lookupBarcode(parsed.code);
      if (!match) {
        setUnknownCode(code);
        setMessage(null);
        record('unknown');
      } else if (!match.available) {
        setMessage({ tone: 'warn', text: t('barcode.gone', { name: match.productName }) });
      } else {
        known.current.set(code, match);
        apply(match, label);
      }
    } catch (err) {
      // No signal, and this phone has never seen the code: there is
      // nothing to go on but the product's name.
      setMessage({ tone: 'warn', text: err?.isNetworkError ? t('barcode.offlineUnknown') : err.message });
    } finally {
      setLooking(false);
    }
  };

  const read = (raw) => {
    queue.current = queue.current.then(() => handle(raw)).catch(() => {});
    return queue.current;
  };

  // An unknown code linked on the spot: known from now on, then counted.
  const linked = (code, match) => {
    known.current.set(code, match);
    rememberBarcode(code, match);
    setUnknownCode(null);
    record('linked', match.productId);
    const said = latest.current.onMatch(match, { useBy: null, batch: null });
    setMessage(asMessage(said));
  };

  return {
    read, linked, message, setMessage, looking, unknownCode,
    dismissUnknown: () => setUnknownCode(null),
  };
}
