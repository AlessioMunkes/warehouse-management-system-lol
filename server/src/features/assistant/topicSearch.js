// ─────────────────────────────────────────────────────────────
// server/src/features/assistant/topicSearch.js
//
// The topics a question's own words point at, with no model.
//
// The model is the assistant's first reader, and this is its second.
// It is used when the model cannot be asked (out of quota, busy, no
// signal to Google) and when the model gives up (not_covered, or two
// invalid choices in a row), so a question still ends in "these look
// closest" instead of a dead end. It never decides anything the model
// would: it only ranks topics this role may already read.
//
// Plain word matching, weighted by where the word is:
//   an `asks` phrase found whole in the question   8
//   a word in the title                            3
//   a word in an `asks` phrase                     2
//   a word in a screen the topic is on              1
//   a word in the body or steps                    1
// Each question word counts once per field, so a long body does not
// win by repeating itself.
// ─────────────────────────────────────────────────────────────
import { topicsForRole, SCREENS } from './helpCatalog.js';

const STOP = new Set(`
  a an the and or but of to in on at for from with by is are was were be been it its this that
  these those i me my we our you your they them their he she his her what which who whom how why
  when where do does did doing done can could should would will shall may might must have has had
  there here then than so if not no yes please thanks just about into onto up out over also some any
  all each every more most other such only own same too very get got make made want need know tell
  show explain mean means thing things way use used using one
`.split(/\s+/).filter(Boolean));

// Crude on purpose, as in groundedAnswer.js: "packing" and "packed"
// should meet.
const stem = (w) => w
  .replace(/'s$/, '')
  .replace(/ies$/, 'y')
  .replace(/(ing|ed|es|s)$/, '')
  .replace(/(.)\1$/, '$1');

const wordsOf = (text) =>
  (String(text ?? '').toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9][a-z0-9']*/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);

const screenWords = new Map(SCREENS.map((s) => [s.id, wordsOf([s.label, ...(s.aka ?? [])].join(' '))]));

const FIELDS = [
  ['title', 3, (t) => wordsOf(t.title)],
  ['asks', 2, (t) => wordsOf((t.asks ?? []).join(' '))],
  ['screens', 1, (t) => (t.screens ?? []).flatMap((id) => screenWords.get(id) ?? [])],
  ['text', 1, (t) => wordsOf([t.body, ...(t.steps ?? [])].join(' '))],
];

const WHOLE_ASK = 8;
// Below this a match is a coincidence of one common word.
export const MIN_SCORE = 4;
// At or above this, a match is good enough to show as the answer
// when the model could not be asked.
export const CONFIDENT_SCORE = 9;

const index = new Map();
const indexOf = (topic) => {
  if (!index.has(topic.id)) {
    index.set(topic.id, {
      fields: FIELDS.map(([, weight, read]) => ({ weight, words: new Set(read(topic)) })),
      asks: (topic.asks ?? []).map((a) => wordsOf(a).join(' ')).filter((a) => a.includes(' ')),
    });
  }
  return index.get(topic.id);
};

export const scoreTopic = (question, topic) => {
  const said = [...new Set(wordsOf(question))];
  if (said.length === 0) return 0;
  const { fields, asks } = indexOf(topic);
  const joined = ` ${wordsOf(question).join(' ')} `;
  let score = asks.some((a) => joined.includes(` ${a} `)) ? WHOLE_ASK : 0;
  for (const w of said) {
    for (const f of fields) if (f.words.has(w)) score += f.weight;
  }
  return score;
};

/**
 * The topics this role may read that the question's words point at,
 * best first, as [{ topic, score }]. Empty when nothing scores enough.
 */
export const searchTopics = (question, role, { limit = 3, exclude = [] } = {}) =>
  topicsForRole(role)
    .filter((t) => !exclude.includes(t.id))
    .map((topic, i) => ({ topic, score: scoreTopic(question, topic), i }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map(({ topic, score }) => ({ topic, score }));

export default { searchTopics, scoreTopic, MIN_SCORE, CONFIDENT_SCORE };
