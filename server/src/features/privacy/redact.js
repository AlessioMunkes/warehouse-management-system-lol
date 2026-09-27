// ─────────────────────────────────────────────────────────────
// server/src/features/privacy/redact.js
//
// What leaves this server for the AI model is never a person.
//
//   redactText(text, names) — before a typed question goes to the
//     model: South African ID numbers, phone numbers and email
//     addresses become [id number] / [phone] / [email], and the name
//     of any person the system knows (staff, centre contacts, donors,
//     callers, volunteers) becomes [person]. Centre, supplier and
//     product names are organisations and are left alone — the
//     reports need them.
//
//   pseudonymise(labels, noun) / restore(text, map) — when the rows
//     of a chart ARE people (packers), the model sees "Packer A",
//     "Packer B", and the real names are put back into its words
//     afterwards, on this server. The model never sees who they are.
//
// The saved query log keeps the original question: it never leaves
// our own database.
// ─────────────────────────────────────────────────────────────

const SA_ID = /\b\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{7}\b/g;       // 13-digit SA ID
const EMAIL = /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g;
const PHONE = /(\+27|\b0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g;
const LONG_NUMBER = /\b\d{9,}\b/g;                                            // any other long ID-like number

// Words that are also first names, which a question uses as words.
const COMMON = new Set(['may', 'june', 'april', 'grace', 'faith', 'hope', 'joy', 'will', 'mark', 'bill', 'rose', 'dawn',
  'week', 'stock', 'order', 'orders', 'food', 'rice', 'maize', 'sugar', 'bread', 'august', 'summer', 'winter', 'april']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Redact a typed question. `names` is a list of full names ("Grizel
 * Goliath"). Full names are matched in any case; a single first or
 * last name only when it is written with a capital and is not also an
 * ordinary word, so "may" and "stock" survive. Words in `keep`
 * (centre, supplier and product names) are never redacted on their own.
 */
export const redactText = (text, names = [], keep = new Set()) => {
  if (typeof text !== 'string' || !text) return { text, redacted: 0 };
  let out = text;
  let redacted = 0;
  const swap = (re, to) => { out = out.replace(re, () => { redacted += 1; return to; }); };

  swap(EMAIL, '[email]');
  swap(SA_ID, '[id number]');
  swap(PHONE, '[phone]');
  swap(LONG_NUMBER, '[number]');

  const full = [...new Set(names.map((n) => String(n ?? '').trim()).filter((n) => n.includes(' ') && n.length >= 5))]
    .sort((a, b) => b.length - a.length);
  for (const n of full) swap(new RegExp(`\\b${escapeRe(n)}\\b`, 'gi'), '[person]');

  const parts = new Set();
  for (const n of names) {
    for (const p of String(n ?? '').split(/\s+/)) {
      if (p.length >= 4 && !COMMON.has(p.toLowerCase()) && !keep.has(p.toLowerCase())) parts.add(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    }
  }
  for (const p of parts) swap(new RegExp(`\\b${escapeRe(p)}\\b`, 'g'), '[person]');

  return { text: out, redacted };
};

/** "Packer A", "Packer B"… for a list of people's names, and the map back. */
export const pseudonymise = (labels, noun = 'Person') => {
  const map = new Map();
  const letter = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);
  labels.forEach((l) => { if (!map.has(l)) map.set(l, `${noun} ${letter(map.size)}`); });
  return { map, alias: (l) => map.get(l) ?? l };
};

/** Put the real names back into text the model wrote about aliases. */
export const restore = (text, map) => {
  if (typeof text !== 'string' || !map?.size) return text;
  let out = text;
  // Longest alias first, so "Packer AB" is not caught by "Packer A".
  const pairs = [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [real, alias] of pairs) out = out.replace(new RegExp(`\\b${escapeRe(alias)}\\b`, 'g'), real);
  return out;
};

export default { redactText, pseudonymise, restore };
