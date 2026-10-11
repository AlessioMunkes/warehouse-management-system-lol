// ─────────────────────────────────────────────────────────────
// server/src/features/assistant/groundedAnswer.js
//
// The guard on the one thing the model is allowed to write.
//
// The assistant still answers by choosing a topic from helpCatalog.js,
// and the topic is still shown word for word. What changed is that the
// model may also offer one or two sentences that answer the person's
// own words ("No. Stock is either bought on a purchase order or
// donated; this is the donated kind."), because a correct topic under
// the wrong-sounding title reads as the wrong answer.
//
// Those sentences are the model's, so they are not trusted. This file
// decides whether they are shown. The rule is simple and deliberately
// blunt: THE ANSWER MAY ONLY SAY WHAT THE CHOSEN TOPIC SAYS. Every
// meaningful word in it has to come from that topic's own text (or the
// short description of the organisation the model was given), and so
// does every number. It may select, shorten and rephrase. It may not
// add a screen, a step, a rule or a figure the topic does not contain.
//
// A sentence that fails is dropped, not repaired, and the person gets
// the topic alone, which is what they got before this existed. So the
// worst this can do is nothing.
//
// It is a vocabulary check, not understanding: it cannot tell "do X"
// from "do not X" when both use the topic's words. That is why the
// topic is always shown underneath, and why the answer is kept to a
// couple of sentences.
// ─────────────────────────────────────────────────────────────

const MAX_LENGTH    = 320;
const MIN_LENGTH    = 12;
const MAX_SENTENCES = 3;
// How much of the answer may be words the topic does not use: joining
// words the stop list misses, a rephrasing or two. Not a new idea.
const MAX_UNKNOWN_WORDS = 2;
const MAX_UNKNOWN_SHARE = 0.15;

// Words that carry no claim. Four letters and up; shorter ones are
// ignored outright.
const STOP = new Set(`
  this that these those with from your yours have having will would should could must need needs
  then than when what which where while there their they them into onto only also still already
  here does doing done been being each every both just more most some other others another once
  first next last instead again back make makes made sure tell tells says said mean means either
  whether until about over under same such very much many because before after during through
  cannot can't don't doesn't isn't aren't wasn't won't it's that's there's you're they're
  yes okay please thanks sorry right correct exactly actually simply always never
`.split(/\s+/).filter(Boolean));

const words = (text) =>
  String(text ?? '').toLowerCase().replace(/[’']/g, "'").match(/[a-z][a-z']*[a-z]|[a-z]/g) ?? [];

// Crude on purpose: "packed", "packing" and "packs" are the same word
// to this check. Over-matching here only makes the check kinder to an
// honest rephrasing; it cannot let a new noun in.
const stem = (word) => word
  .replace(/'s$/, '')
  .replace(/(ies)$/, 'y')
  .replace(/(ing|ed|es|ly|s)$/, '')
  .replace(/(.)\1$/, '$1');

const contentWords = (text) => words(text).filter((w) => w.length >= 4 && !STOP.has(w)).map(stem);

const numbers = (text) => String(text ?? '').match(/\d+(?:[.,:]\d+)*/g) ?? [];

const sourceTextOf = (topic, context = '') => [
  topic.title, topic.body, ...(topic.steps ?? []), ...(topic.asks ?? []), context,
].filter(Boolean).join(' ');

const tidy = (raw) => String(raw)
  .replace(/[*_#>`]/g, '')              // no markdown: it is shown as plain text
  .replace(/\s*[—–]\s*/g, ', ') // no dashes on screen
  .replace(/\s+/g, ' ')
  .trim();

const sentencesOf = (text) => text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

/**
 * The answer as it may be shown, or null when it may not be.
 *
 * @param {unknown} raw      what the model wrote
 * @param {object}  topic    the catalogue topic it chose
 * @param {string}  context  the organisation description the model was given
 */
export const checkAnswer = (raw, topic, context = '') => {
  if (typeof raw !== 'string' || !topic) return null;

  let text = tidy(raw);
  if (text.length < MIN_LENGTH) return null;

  // Nothing that points outside the app, and nothing shaped like a
  // contact detail.
  if (/https?:|www\.|@|\.co\.za|\.com\b/i.test(text)) return null;

  // Whole sentences, a few of them, within the length.
  const kept = [];
  for (const sentence of sentencesOf(text).slice(0, MAX_SENTENCES)) {
    if ([...kept, sentence].join(' ').length > MAX_LENGTH) break;
    kept.push(sentence);
  }
  text = kept.join(' ');
  if (text.length < MIN_LENGTH) return null;

  const source = sourceTextOf(topic, context);

  // Every figure has to be the topic's own.
  const known = new Set(numbers(source));
  if (numbers(text).some((n) => !known.has(n))) return null;

  // Every meaningful word has to be the topic's own.
  const vocabulary = new Set(contentWords(source));
  const said = contentWords(text);
  if (said.length === 0) return null;
  const unknown = said.filter((w) => !vocabulary.has(w));
  if (unknown.length > MAX_UNKNOWN_WORDS || unknown.length / said.length > MAX_UNKNOWN_SHARE) return null;

  return text;
};

export default { checkAnswer };
