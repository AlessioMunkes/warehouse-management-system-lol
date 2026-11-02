// ─────────────────────────────────────────────────────────────
// client/src/features/settings/translationEntries.js
//
// Every translatable piece of floor text, as rows for Settings →
// Translations: the keyed messages (translations/messages.js, counted
// wording split into its one / other halves) and the on-page phrases
// (phrases.js, passed in because it is loaded only when needed).
// ─────────────────────────────────────────────────────────────
import { MESSAGES } from '../../translations/messages';

const keyedPlaceholders = (text) => [...new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
const phrasePlaceholders = (text) => [...String(text).matchAll(/\{\}/g)].map(() => '{}');

export const buildEntries = (phrases) => {
  const rows = [];
  for (const [key, english] of Object.entries(MESSAGES.en)) {
    if (english && typeof english === 'object') {
      for (const part of ['one', 'other']) {
        rows.push({
          kind: 'key', source: `${key}#${part}`, english: english[part],
          builtIn: { af: MESSAGES.af[key]?.[part] ?? null, xh: MESSAGES.xh[key]?.[part] ?? null },
          placeholders: keyedPlaceholders(english[part]),
        });
      }
    } else {
      rows.push({
        kind: 'key', source: key, english,
        builtIn: { af: typeof MESSAGES.af[key] === 'string' ? MESSAGES.af[key] : null, xh: typeof MESSAGES.xh[key] === 'string' ? MESSAGES.xh[key] : null },
        placeholders: keyedPlaceholders(english),
      });
    }
  }
  // A phrase can have the same English as a keyed message: they are
  // shown in different places, so each is listed and changed on its own.
  for (const [english, af, xh] of phrases) {
    rows.push({ kind: 'phrase', source: english, english, builtIn: { af, xh }, placeholders: phrasePlaceholders(english) });
  }
  return rows;
};

