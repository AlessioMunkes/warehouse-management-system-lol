// ─────────────────────────────────────────────────────────────
// server/src/services/assistant.service.js
//
// Question in, help topic or screen out.
//   question → model → { topic_id } → catalogue lookup → answer
//                    → { screen_id } → role check → navigate
//
// THE MODEL CHOOSES WHICH ANSWER, NEVER WHAT THE ANSWER SAYS, AND
// NEVER WHERE IT GOES. Everything the user reads is written in
// helpCatalog.js and looked up by id. Every screen it can open is in
// SCREENS with a role list. A hallucinated id, a topic or screen
// belonging to another role, or a prompt injection buried in the
// question all end in the same place: a lookup that fails.
//
// WHY THAT MATTERS MORE THAN IN REPORTING. A wrong report is a wrong
// number a manager will sanity-check. A wrong help answer is a
// confident instruction to a volunteer holding a crate — and now it
// can also MOVE them. So the assistant is allowed to be unhelpful
// and is never allowed to be inventive.
//
// NAVIGATION IS GATED THREE TIMES. The model is only offered screens
// this role may open (toolSchema); the result is checked again here;
// and ProtectedRoute plus the server's requireRole stand behind
// both. This layer cannot grant access to anything — at most it
// declines to offer it, and the two real gates never move.
// ─────────────────────────────────────────────────────────────
import provider from '../features/reporting/ai/provider.js';
import { buildTools, buildSystemPrompt } from '../features/assistant/ai/toolSchema.js';
import {
  SCREENS, getTopic, topicsForRole, screensForRole, screenForRole,
  suggestionsFor, publicTopic,
} from '../features/assistant/helpCatalog.js';
import logRepo from '../repositories/assistantLog.repository.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const MAX_QUESTION = 300;
const MIN_QUESTION = 3;
const MAX_ATTEMPTS = 2;

// The provider writes its messages for the REPORTING screen — they
// end "use the report builder below", which is nonsense in a help
// panel with no report builder in it. It tags each failure with a
// code; this is the same meaning said to somebody who is stuck
// mid-task, and each one still says whether waiting will help.
const PROVIDER_MESSAGE = {
  rate_limit:    'I have answered a lot of questions this hour. Try the suggestions, or ask someone on the floor.',
  busy:          'I am busy right now — this usually clears in a minute. Try again.',
  timeout:       'That took too long to come back. Try again.',
  unreachable:   'I cannot reach the help service right now. Check the connection.',
  model_missing: 'The help assistant is not set up correctly. Tell whoever looks after the system.',
  error:         'Something went wrong at my end. Try again, or ask someone on the floor.',
};

const rephrase = (err) => {
  const text = PROVIDER_MESSAGE[err.code];
  if (!text) return err;
  const out = new Error(text);
  out.status = err.status;
  out.code   = err.code;
  return out;
};

const screenById = new Map(SCREENS.map((s) => [s.id, s]));

/**
 * The catalogue as the client needs it: what this role may be told,
 * where it may be taken, and the starter chips per screen. One call
 * on first open — no model, no cost.
 */
export const getCatalog = (role) => ({
  enabled: provider.isEnabled(),
  screens: screensForRole(role).map((s) => ({ id: s.id, label: s.label })),
  topics:  topicsForRole(role).map((t) => ({
    id: t.id, title: t.title, screens: t.screens ?? [],
  })),
  suggestions: Object.fromEntries(
    SCREENS.map((s) => [s.id, suggestionsFor(s.id, role)])
  ),
});

/** A topic by id, for the starter chips and the related links. */
export const getTopicForRole = (id, role) => {
  const topic = getTopic(id);
  // Checked here and not only in the prompt: these ids arrive
  // straight from the client, which can ask for any of them.
  if (!topic || !topic.roles.includes(role)) {
    throw fail(404, 'That help topic does not exist.');
  }
  return { type: 'topic', topic: publicTopic(topic) };
};

export const ask = async ({ question, screen, userId, role }) => {
  if (!provider.isEnabled()) {
    throw fail(503, 'The help assistant is not switched on.');
  }
  if (typeof question !== 'string' || question.trim().length < MIN_QUESTION) {
    throw fail(400, 'Type a few more words and I will have a better go at it.');
  }
  if (question.length > MAX_QUESTION) {
    throw fail(400, 'That is a bit long for me — try asking it in a sentence.');
  }

  const started = Date.now();
  const tools   = buildTools(role);
  const system  = buildSystemPrompt(role);

  const log = (outcome, extra = {}) => logRepo.record({
    userId,
    role,
    screen: screen ?? null,
    question,
    outcome,
    latencyMs: Date.now() - started,
    provider:  provider.providerName(),
    ...extra,
  });

  // Screen is context, not instruction: it tips a vague "how does
  // this work" toward what they are looking at, and it is the only
  // thing about their session the model is told.
  const where = screenById.get(screen)?.label;
  const base  = where ? `They are on: ${where}\n\nThey asked: ${question}` : question;

  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const userMessage = attempt === 0
      ? base
      : `${base}\n\nYour previous attempt was rejected: ${lastError}\nTry again.`;

    try {
      const call = await provider.callWithTools({ systemPrompt: system, userMessage, tools });

      if (call.name === 'explain_topic') {
        const topic = getTopic(call.args?.topic_id);
        // Belt and braces. The id came from an enum built for this
        // role, so this should be unreachable — but "should be" is
        // not a guarantee with a model on the other end.
        if (!topic || !topic.roles.includes(role)) {
          lastError = `Unknown topic: ${call.args?.topic_id}`;
          continue;
        }
        log('topic', { topicId: topic.id });
        return { type: 'topic', topic: publicTopic(topic) };
      }

      if (call.name === 'open_screen') {
        // THE NAVIGATION GATE. screenForRole returns nothing for a
        // screen this role may not open, so an id the model should
        // never have had is indistinguishable from one that does not
        // exist — and neither navigates.
        const target = screenForRole(call.args?.screen_id, role);
        if (!target) {
          lastError = `Cannot open ${call.args?.screen_id} for a ${role}.`;
          continue;
        }
        log('navigate', { screenId: target.id });
        return { type: 'navigate', screen: { id: target.id, label: target.label } };
      }

      if (call.name === 'ask_clarification') {
        const options = (call.args?.options ?? []).filter((o) => typeof o === 'string');
        if (options.length < 2) {
          lastError = 'ask_clarification needs at least two options.';
          continue;
        }
        log('clarify');
        return {
          type: 'clarify',
          question: call.args.question,
          options: options.slice(0, 4),
        };
      }

      if (call.name === 'not_covered') {
        const closest = getTopic(call.args?.closest_topic_id);
        log('not_covered');
        return {
          type: 'not_covered',
          // Offered, not asserted: the model has just said it does
          // not think this is the answer. Role-checked, so a refusal
          // cannot leak what it is refusing.
          closest: closest && closest.roles.includes(role)
            ? { id: closest.id, title: closest.title }
            : null,
        };
      }

      lastError = `Unknown function: ${call.name}`;
    } catch (err) {
      // EVERY thrown provider error is terminal, including the 429.
      //
      // The retry loop exists for the model choosing something
      // invalid — an unknown topic, a forbidden screen — which are
      // `continue`s above, not exceptions. Nothing the provider
      // throws gets better by asking again with the same prompt:
      // busy and timeout it has already retried internally, and a
      // 429 means the quota is gone, so a second attempt spends a
      // call that was never going to work and leaves the person
      // reading "I could not work out which part of the system that
      // is about" instead of "you have asked a lot this hour".
      log('error', { errorMessage: err.message });
      throw rephrase(err);
    }
  }

  log('unresolved', { errorMessage: lastError });
  throw fail(422, 'I could not work out which part of the system that is about. Try naming the screen you are on, or ask your manager.');
};

export default { ask, getCatalog, getTopicForRole };
