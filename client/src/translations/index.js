// ─────────────────────────────────────────────────────────────
// client/src/translations/index.js
//
// The floor screens in English, Afrikaans or isiXhosa.
//
//   const t = useT();
//   t('packing.claim')                       -> 'Claim'
//   t('packing.itemsPacked', { done, all })  -> '3/8 items packed'
//   t.n('packing.stillNeeded', count)        -> one / other wording
//
// HOW IT IS LAID OUT
// messages.js holds every piece of text once, under a key, in all three
// languages. English is the source: a key missing from another language
// shows in English rather than as a blank or a key name, so a screen is
// never broken by a translation that has not been written yet.
//
// WHERE THE CHOICE LIVES
// On the account (users.language, GET/PATCH /api/me/language), because
// tablets are shared and the language should follow whoever signs in.
// It is also kept on the device, so the screens open in the right
// language at once, before the server has answered and when there is no
// signal. The account's answer wins when it arrives.
//
// Plain module state and a subscription rather than a React context:
// nothing has to be wrapped in a provider, so a screen rendered on its
// own (every test, for one) reads English and just works.
//
// TWO WAYS TEXT IS TRANSLATED
// By key, here: home, the tab bar, the no-signal bar and Packing ask for
// their text with t(). By phrase, on the page: every other floor screen
// is written in English and floorTranslator.js swaps each phrase it
// finds in phrases.js. New floor text can use either; a phrase missing
// from both stays in English.
//
// ONLY THE FLOOR. Manager and admin screens are not translated and do
// not read this.
// ─────────────────────────────────────────────────────────────
import { useMemo, useSyncExternalStore } from 'react';
import { MESSAGES } from './messages';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'xh', name: 'isiXhosa' },
];
const CODES = LANGUAGES.map((l) => l.code);
const STORAGE_KEY = 'wms_language';

const readStored = () => {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return CODES.includes(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
};

let current = readStored();
const listeners = new Set();

export const getLanguage = () => current;

export const setLanguage = (code) => {
  const next = CODES.includes(code) ? code : 'en';
  if (next === current) return;
  current = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, next); } catch { /* private window: kept for this visit only */ }
  // The page's own language, for screen readers and hyphenation.
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const listener of listeners) {
    try { listener(); } catch { /* not our problem */ }
  }
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const fill = (text, vars) => (vars
  ? text.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] === undefined || vars[name] === null ? '' : String(vars[name])))
  : text);

const lookup = (language, key) => MESSAGES[language]?.[key] ?? MESSAGES.en[key];

// The translator for one language. Exported for tests and for code that
// is not a component.
export const translator = (language) => {
  const t = (key, vars) => {
    const text = lookup(language, key);
    // An unknown key shows itself, so a typo is seen and not silently blank.
    return typeof text === 'string' ? fill(text, vars) : key;
  };
  // Wording that depends on a count: the entry is { one, other }.
  t.n = (key, count, vars) => {
    const entry = lookup(language, key);
    if (!entry || typeof entry !== 'object') return t(key, { n: count, ...vars });
    return fill(Number(count) === 1 ? entry.one : entry.other, { n: count, ...vars });
  };
  t.language = language;
  return t;
};

export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage, () => 'en');

export const useT = () => {
  const language = useLanguage();
  return useMemo(() => translator(language), [language]);
};
