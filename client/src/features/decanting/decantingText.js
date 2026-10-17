// ─────────────────────────────────────────────────────────────
// src/features/decanting/decantingText.js
//
// The decanting screen's dates, weights and sentences, worked out from
// the plan the server returns. No React: DecantingFlow.jsx and
// DecantingParts.jsx both read from here.
// ─────────────────────────────────────────────────────────────

// Monday of the current week, which is what weekOf means server-side.
export const mondayOfThisWeek = () => {
  const now = new Date();
  const day = now.getDay();               // 0 Sunday .. 6 Saturday
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now.toISOString().slice(0, 10);
};

export const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

// "500g" and "2kg" are the labels decanting.service.js returns as the
// keys of the bags object; this turns one into a sentence.
export const bagPhrase = (label, count) => `${Number(count) === 1 ? 'bag' : 'bags'} of ${label}`;

export const grams = (kg) => `${Math.round(Number(kg || 0) * 1000)}g`;
export const readableKg = (kg) => {
  const value = Number(kg || 0);
  if (value >= 1) return `${Number(value.toFixed(2))}kg`;
  return grams(value);
};

export const partialBagText = (partialBag) => {
  if (!partialBag?.isPartial) return null;
  return `Actual contents: ${grams(partialBag.actualWeightKg)}`;
};

// The margin, said the way someone standing at a scale would say it.
// A percentage on screen is a number nobody can act on.
export const leftoverSentence = (plan) => {
  const left = Number(plan.surplusKg ?? 0);
  if (left <= 0) return 'That uses the whole bulk amount.';
  if (left < 1) return 'That leaves a little under a kilo of the bulk amount.';
  return `That leaves about ${Math.round(left)} kg of the bulk amount.`;
};

export const parseKgInput = (raw) => {
  const text = String(raw ?? '').trim();
  if (text === '') return { blank: true, value: null };
  if (!/^-?\d+(?:[.,]\d{1,3})?$/.test(text)) return { invalid: true, value: null };
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? { value } : { invalid: true, value: null };
};

// Bag labels, largest first, as the plan returned them.
export const planLabels = (line) => line
  ? Object.keys(line.bags)
      .filter((label) => Number(line.bags[label]) > 0)
      .sort((a, b) => {
        const kg = (l) => (l.endsWith('kg') ? parseFloat(l) : parseFloat(l) / 1000);
        return kg(b) - kg(a);
      })
  : [];

// The server refuses a bulk weight above what is in stock, and says how
// much there is. That is shown as it stands; anything else gets the
// screen's own wording.
export const stockMessage = (err) => (/in stock\./.test(err?.message ?? '') ? err.message : null);

