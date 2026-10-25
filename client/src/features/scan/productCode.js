// ─────────────────────────────────────────────────────────────
// client/src/features/scan/productCode.js
//
// What a scanned or typed product barcode is, in the one form the
// server stores it in. The twin of server/src/utils/barcode.js, rule
// for rule, so a code this screen accepts is a code the server finds,
// and a misread (a wrong check digit) is answered here without a
// round trip.
//
//   12 digits (UPC-A)          '0' + the 12        → EAN-13
//   13 digits (EAN-13)         as is
//   14 digits starting 0       the last 13         → EAN-13
//   14 digits, other start     as is (a case code: GTIN-14)
//   8 digits                   EAN-8 if its check digit holds, else
//                              UPC-E expanded to UPC-A → EAN-13
//   a GS1 case label           its GTIN, by the rules above, with the
//                              use-by date and batch it carries
//   anything else              a supplier's own Code 128 text,
//                              upper-cased, 4 to 64 characters
//
// Spaces and hyphens are dropped first, in every case: that is how a
// person reads a code off a pack.
//
// Change one file, change the other. productCode.test.js and
// server/__tests__/barcode.util.test.js check the same codes.
// ─────────────────────────────────────────────────────────────

const MAX_LENGTH = 64;
// A GS1 label is longer than the code it carries.
const MAX_RAW_LENGTH = 160;
const GS = '\u001d';

// GS1 check digit, for EAN-8, UPC-A, EAN-13 and GTIN-14 alike: from
// the right, ignoring the check digit itself, weights 3, 1, 3, 1...
export const gs1CheckDigitOk = (digits) => {
  if (!/^\d{8,14}$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
};

// UPC-E (8 digits: number system, six digits, check) to its UPC-A.
// Only number systems 0 and 1 exist.
export const expandUpcE = (code) => {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const n = code[0];
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7);
  const c = code[7];
  let body;
  if (d6 <= '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${n}${body}${c}`;
};

// ── GS1 application identifiers ───────────────────────────────
// [ai, fixed length or null for variable, max length]. Only what a
// food case label carries; anything else stops the read.
const GS1_AIS = [
  ['00', 18], ['01', 14], ['02', 14],
  ['10', null, 20], ['21', null, 20],
  ['11', 6], ['13', 6], ['15', 6], ['16', 6], ['17', 6],
  ['30', null, 8], ['37', null, 8],
];
// Net weight and similar measures: 310n to 369n, six digits each.
const MEASURE_AI = /^3[1-6]\d\d$/;

// YYMMDD to 'YYYY-MM-DD'. Day 00 means the last day of the month.
const gs1Date = (yymmdd) => {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === 0) day = last;
  if (day > last) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// "(01)09501101530003(17)261231(10)AB12" → { '01': ..., '17': ..., '10': ... }
const readBracketed = (text) => {
  const fields = {};
  const re = /\((\d{2,4})\)([^(]*)/gy;
  let m;
  let at = 0;
  while ((m = re.exec(text)) !== null) {
    fields[m[1]] = m[2];
    at = re.lastIndex;
  }
  return at === text.length && Object.keys(fields).length ? fields : null;
};

// The same without brackets: fixed-length fields end by their length,
// variable ones at a separator or the end.
const readRaw = (text) => {
  const fields = {};
  let i = 0;
  while (i < text.length) {
    if (text[i] === GS) { i += 1; continue; }
    const two = text.slice(i, i + 2);
    const four = text.slice(i, i + 4);
    let ai; let fixed; let max;
    const known = GS1_AIS.find(([code]) => code === two);
    if (known) [ai, fixed, max] = known;
    else if (MEASURE_AI.test(four)) { ai = four; fixed = 6; }
    else return null;
    i += ai.length;
    let value;
    if (fixed) {
      value = text.slice(i, i + fixed);
      if (value.length !== fixed) return null;
      i += fixed;
    } else {
      const end = text.indexOf(GS, i);
      value = text.slice(i, end === -1 ? text.length : end);
      if (!value || value.length > max) return null;
      i += value.length;
    }
    fields[ai] = value;
  }
  return Object.keys(fields).length ? fields : null;
};

// { gtin, useBy, batch }    a GS1 label, read
// { invalid: true }         shaped like one but not readable: a misread
// null                      not GS1 at all
export const parseGs1 = (raw) => {
  let text = String(raw ?? '').trim();
  let flagged = false;
  // AIM symbology identifiers a scanner may put in front: GS1-128,
  // GS1 DataMatrix, GS1 QR.
  const prefix = /^\](C1|d2|Q3)/.exec(text);
  if (prefix) { text = text.slice(3); flagged = true; }
  if (text.startsWith(GS)) { text = text.slice(1); flagged = true; }
  if (text.includes(GS)) flagged = true;

  // Without brackets or a separator, only a string that starts with
  // (01) or (02) and a 14-digit GTIN is read as GS1: no plain barcode
  // is that long. Anything shorter is a plain barcode.
  const bracketed = /^\(\d{2,4}\)/.test(text);
  const looksRaw = flagged || /^0[12]\d{14}/.test(text);
  if (!bracketed && !looksRaw) return null;

  const fields = bracketed ? readBracketed(text.replace(/\s/g, '')) : readRaw(text);
  if (!fields) return { invalid: true };

  const gtin = fields['01'] ?? fields['02'];
  if (!gtin || !/^\d{14}$/.test(gtin) || !gs1CheckDigitOk(gtin)) return { invalid: true };
  const useBy = gs1Date(fields['17'] ?? '') ?? gs1Date(fields['15'] ?? '');
  return { gtin, useBy: useBy ?? null, batch: fields['10'] ?? null };
};

// The plain rules, for a code that has already had GS1 taken off it.
const normalisePlain = (squeezed) => {
  if (!squeezed || squeezed.length > MAX_LENGTH) return null;

  if (/^\d+$/.test(squeezed)) {
    const len = squeezed.length;
    if (len === 13) return gs1CheckDigitOk(squeezed) ? { code: squeezed, format: 'ean13' } : null;
    if (len === 12) return gs1CheckDigitOk(squeezed) ? { code: `0${squeezed}`, format: 'ean13' } : null;
    if (len === 14) {
      if (!gs1CheckDigitOk(squeezed)) return null;
      return squeezed[0] === '0'
        ? { code: squeezed.slice(1), format: 'ean13' }
        : { code: squeezed, format: 'gtin14' };
    }
    if (len === 8) {
      if (gs1CheckDigitOk(squeezed)) return { code: squeezed, format: 'ean8' };
      const upcA = expandUpcE(squeezed);
      return upcA && gs1CheckDigitOk(upcA) ? { code: `0${upcA}`, format: 'ean13' } : null;
    }
    // Any other run of digits is somebody's own numbering, read as text.
  }

  // Printable ASCII only: a scanner set to the wrong keyboard layout
  // sends garbage, and garbage should not become a product's barcode.
  if (squeezed.length < 4 || !/^[\x21-\x7e]+$/.test(squeezed)) return null;
  return { code: squeezed.toUpperCase(), format: 'text' };
};

// { code, format, gs1? } | null
//   format: 'ean13' | 'ean8' | 'gtin14' | 'text'
//   gs1:    { useBy, batch } when the code came off a GS1 case label
export const normaliseBarcode = (raw) => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw);
  if (text.length > MAX_RAW_LENGTH) return null;

  const gs1 = parseGs1(text);
  if (gs1?.invalid) return null;
  if (gs1) {
    const plain = normalisePlain(gs1.gtin);
    return plain ? { ...plain, gs1: { useBy: gs1.useBy, batch: gs1.batch } } : null;
  }

  return normalisePlain(text.trim().replace(/[\s-]/g, ''));
};

// The code the system prints on its own labels for a decanted bag:
// the product and the bag size, so a scan names both. "LOL12K2000" is
// product 12 in 2000 g (2 kg) bags. Plain Code 128 text by the rules
// above, so it is stored and found like any supplier's code.
export const ownBagCode = (productId, sizeKg) =>
  `LOL${Number(productId)}K${Math.round(Number(sizeKg) * 1000)}`;

// The code on a label the system prints for any stock item, for one
// label's worth of it in the item's own unit:
//   weighed or poured (kg, l)  as a bag code: 2 kg of rice is LOL12K2000,
//                              the same code a 2 kg decanted bag carries
//   g, ml                      the same, from grams: 500 g is LOL12K500
//   counted (each, crate, ...) LOL<id>N<how many>: one crate of
//                              butternut is LOL4N1, a box of 6 LOL4N6
// null for a quantity that cannot be one (none, or part of a counted one).
const LOOSE_KG = ['kg', 'l'];
const LOOSE_G = ['g', 'ml'];
export const ownLabelCode = (productId, quantity, unit) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (LOOSE_KG.includes(unit)) return ownBagCode(productId, qty);
  if (LOOSE_G.includes(unit)) return ownBagCode(productId, qty / 1000);
  if (!Number.isInteger(qty)) return null;
  return `LOL${Number(productId)}N${qty}`;
};

export default { normaliseBarcode, gs1CheckDigitOk, expandUpcE, parseGs1, ownBagCode, ownLabelCode };
