// ─────────────────────────────────────────────────────────────
// client/src/translations/floorTranslator.js
//
// Puts the floor's remaining English into the chosen language, on the
// page, from the phrase table in phrases.js.
//
// WHY ON THE PAGE
// Home, the tab bar and Packing ask for their text by key (useT). The
// other floor screens — receiving, decanting, dispatch, donations,
// requests, Feed the Soil, their dialogs, toasts and error lines — are
// some six hundred pieces of English written where they are used. This
// reads what a screen has put on the page and swaps each phrase it
// knows, so every one of those screens is covered without rewriting it,
// and a phrase with no translation simply stays in English.
//
// WHAT IT TOUCHES
// Text, and the four attributes that are read by a person: placeholder,
// aria-label, title and alt. Never what someone has typed, and nothing
// inside an element marked translate="no".
//
// WHY IT IS SAFE WITH REACT
// Only the text of an existing node is changed; nodes are never added,
// removed or wrapped (that is what breaks a page under a browser's own
// translator). React compares against what it last rendered, not
// against the page, so it leaves a translated node alone until its own
// English changes, and then this translates the new text.
//
// IN ENGLISH NOTHING RUNS: no observer, and phrases.js is not loaded.
// ─────────────────────────────────────────────────────────────

const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);
const COLUMN = { af: 1, xh: 2 };

// ── The table, built once ────────────────────────────────────
// Whole phrases by their English; phrases with {} as patterns, longest
// first so the most specific one wins.
let tables = null;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildTables = (phrases) => {
  const exact = new Map();
  const patterns = [];
  for (const row of phrases) {
    const english = row[0];
    if (!english.includes('{}')) { exact.set(english, row); continue; }
    const source = english.split('{}').map(escapeRe).join('(.+?)');
    patterns.push({ re: new RegExp(`^${source}$`, 's'), row, length: english.length });
  }
  patterns.sort((a, b) => b.length - a.length);
  return { exact, patterns };
};

// One piece of English in `language`, or null when it is not known.
export const translatePhrase = (english, language, table = tables) => {
  const column = COLUMN[language];
  if (!column || !table) return null;
  const hit = table.exact.get(english);
  if (hit) return hit[column];
  if (!/[A-Za-z]/.test(english)) return null;
  for (const { re, row } of table.patterns) {
    const found = re.exec(english);
    if (!found) continue;
    let n = 0;
    // What was filled in is carried across; if it is itself a phrase
    // ("Decanting / What you are working with") it is translated too.
    return row[column].replace(/\{\}/g, () => {
      n += 1;
      const value = found[n] ?? '';
      return table.exact.get(value)?.[column] ?? value;
    });
  }
  return null;
};

// ── The page ─────────────────────────────────────────────────
let language = 'en';
let observer = null;
// node -> { source, shown }: the English it held and what was put there.
let textRecords = new WeakMap();
// element -> { [attribute]: { source, shown } }
let attributeRecords = new WeakMap();
const missed = typeof window !== 'undefined' ? (window.__wmsUntranslated ??= new Set()) : new Set();
const debugging = () => { try { return globalThis.localStorage?.getItem('wms_i18n_debug') === '1'; } catch { return false; } };

const skipped = (element) => {
  for (let el = element; el && el.nodeType === 1; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName) || el.getAttribute('translate') === 'no' || el.isContentEditable) return true;
  }
  return false;
};

const swap = (english) => {
  const core = english.trim();
  if (!core) return null;
  const translated = translatePhrase(core, language);
  if (translated === null) {
    if (debugging() && /[A-Za-z]{3}/.test(core)) missed.add(core);
    return null;
  }
  // The spaces around the words are part of the layout: keep them.
  const lead = english.slice(0, english.indexOf(core));
  const tail = english.slice(lead.length + core.length);
  return lead + translated + tail;
};

const translateText = (node) => {
  const now = node.nodeValue;
  const record = textRecords.get(node);
  if (record && record.shown === now) return;            // our own writing, or unchanged
  if (!node.parentElement || skipped(node.parentElement)) return;
  const shown = swap(now);
  if (shown === null || shown === now) { textRecords.delete(node); return; }
  textRecords.set(node, { source: now, shown });
  node.nodeValue = shown;
};

const translateAttributes = (element) => {
  for (const name of ATTRIBUTES) {
    const now = element.getAttribute(name);
    if (now === null) continue;
    const records = attributeRecords.get(element) ?? {};
    if (records[name]?.shown === now) continue;
    if (skipped(element)) return;
    const shown = swap(now);
    if (shown === null || shown === now) { delete records[name]; continue; }
    records[name] = { source: now, shown };
    attributeRecords.set(element, records);
    element.setAttribute(name, shown);
  }
};

const walk = (root, onText, onElement) => {
  if (root.nodeType === 3) { onText(root); return; }
  if (root.nodeType !== 1) return;
  onElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) onText(node); else onElement(node);
  }
};

const restoreText = (node) => {
  const record = textRecords.get(node);
  if (record && node.nodeValue === record.shown) node.nodeValue = record.source;
  textRecords.delete(node);
};
const restoreAttributes = (element) => {
  const records = attributeRecords.get(element);
  if (!records) return;
  for (const [name, record] of Object.entries(records)) {
    if (element.getAttribute(name) === record.shown) element.setAttribute(name, record.source);
  }
  attributeRecords.delete(element);
};

const onMutations = (mutations) => {
  for (const m of mutations) {
    if (m.type === 'characterData') translateText(m.target);
    else if (m.type === 'attributes') translateAttributes(m.target);
    else for (const node of m.addedNodes) walk(node, translateText, translateAttributes);
  }
};

// Bumped by every start and stop, so a start that was still loading
// the table when something newer happened does nothing.
let ticket = 0;

const halt = () => {
  if (observer) { observer.disconnect(); observer = null; }
  if (typeof document !== 'undefined' && document.body) walk(document.body, restoreText, restoreAttributes);
  textRecords = new WeakMap();
  attributeRecords = new WeakMap();
  language = 'en';
};

/** Back to the English the screens rendered, and stop watching. */
export const stopFloorTranslation = () => { ticket += 1; halt(); };

/**
 * Translate the page into `code` and keep it translated as it changes.
 * English, or a language with no column, stops it instead.
 */
export const startFloorTranslation = async (code) => {
  ticket += 1;
  const mine = ticket;
  if (!COLUMN[code]) { halt(); return; }
  if (!tables) {
    const { PHRASES } = await import('./phrases');
    tables = buildTables(PHRASES);
  }
  if (mine !== ticket) return;
  halt();
  language = code;
  if (typeof document === 'undefined' || !document.body) return;
  walk(document.body, translateText, translateAttributes);
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRIBUTES,
  });
};
