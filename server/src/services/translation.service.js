// ─────────────────────────────────────────────────────────────
// server/src/services/translation.service.js
//
// Settings → Wording. The wording itself lives in the app
// (client/src/translations); an admin can replace any Afrikaans or
// isiXhosa piece of it here, without a developer.
//
// READS NEVER FAIL: a database that cannot be read (or has not had
// migration 002) gives no overrides, and the screens use the built-in
// wording, as they did before this existed.
// ─────────────────────────────────────────────────────────────
import translationRepository from '../repositories/translation.repository.js';

export const LANGUAGES = ['af', 'xh'];
export const KINDS = ['key', 'phrase'];
const fail = (status, message) => Object.assign(new Error(message), { status });

// Every override, grouped the way the app looks them up:
// { key: { af: { 'packing.claim': '…' }, xh: {…} }, phrase: { af: { 'Cancel': '…' }, xh: {…} } }
export const overrides = async () => {
  const out = { key: { af: {}, xh: {} }, phrase: { af: {}, xh: {} } };
  try {
    for (const row of await translationRepository.list()) {
      if (out[row.kind]?.[row.language]) out[row.kind][row.language][row.source] = row.text;
    }
  } catch (err) {
    console.error('[translations] Using the built-in wording; could not read overrides:', err.message);
  }
  return out;
};

const MESSAGE_KEY = /^[A-Za-z][\w.-]{0,199}(#(one|other))?$/;

// The { language, kind, source } a request names, checked.
const target = (body) => {
  const { language, kind, source } = body ?? {};
  if (!LANGUAGES.includes(language)) throw fail(400, 'Choose Afrikaans (af) or isiXhosa (xh).');
  if (!KINDS.includes(kind)) throw fail(400, 'Kind must be key or phrase.');
  if (typeof source !== 'string' || source.length === 0 || source.length > 500) {
    throw fail(400, 'Say which wording to change.');
  }
  if (kind === 'key' && !MESSAGE_KEY.test(source)) throw fail(400, 'That is not a message key.');
  return { language, kind, source };
};

// Placeholders like {name} in a keyed message, or {} in a phrase, are
// filled in on screen. A translation that drops or invents one would
// show the wrong thing (or a raw "{name}"), so both must use the same.
const placeholders = (kind, text) => (kind === 'key'
  ? [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  : [...text.matchAll(/\{\}/g)].map(() => '{}'));

export const save = async (body, userId) => {
  const t = target(body);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw fail(400, 'Type the wording, or reset it to go back to the built-in one.');
  if (text.length > 1000) throw fail(400, 'Keep it under 1000 characters.');
  if (Array.isArray(body.placeholders)) {
    const want = [...body.placeholders].map(String).sort();
    const got = placeholders(t.kind, text);
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      const shown = t.kind === 'key' ? want.map((p) => `{${p}}`).join(' ') : want.join(' ');
      throw fail(400, want.length
        ? `Keep ${shown} in the wording: the app fills ${want.length === 1 ? 'it' : 'them'} in.`
        : 'Leave out { } placeholders: this wording has none.');
    }
  }
  return translationRepository.save({ ...t, text }, userId);
};

export const reset = async (body) => {
  const t = target(body);
  await translationRepository.remove(t);
  return { ...t, reset: true };
};

export default { overrides, save, reset, LANGUAGES, KINDS };
