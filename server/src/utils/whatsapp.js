// ─────────────────────────────────────────────────────────────
// server/src/utils/whatsapp.js
//
// WhatsApp goes out by hand: the app builds a click-to-chat link with
// the number and the message filled in, and the person sends it from
// the WhatsApp account on their phone. Used by the collection reminders
// and the not-collected follow-up.
// ─────────────────────────────────────────────────────────────

// A South African mobile number as +27…, or null when it is not one.
export const normaliseSaMobileToE164 = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (hasPlus && digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`;
  if (/^[6-8]\d{8}$/.test(digits)) return `+27${digits}`;

  return null;
};

// The link that opens a chat with `e164` and `message` typed in. Without
// a number it opens WhatsApp with the message and lets the person choose
// the chat (a group, a broadcast list).
export const whatsappLink = (e164, message) => {
  const text = `text=${encodeURIComponent(message)}`;
  return e164 ? `https://wa.me/${e164.replace(/^\+/, '')}?${text}` : `https://wa.me/?${text}`;
};

export default { normaliseSaMobileToE164, whatsappLink };
