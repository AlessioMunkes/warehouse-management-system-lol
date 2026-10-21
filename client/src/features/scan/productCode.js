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

// { code, format } | null
//   format: 'ean13' | 'ean8' | 'gtin14' | 'text'
export const normaliseBarcode = (raw) => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const squeezed = String(raw).trim().replace(/[\s-]/g, '');
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

export default { normaliseBarcode, gs1CheckDigitOk, expandUpcE };
