// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/ai/provider.js
//
// The ONLY file that knows which AI provider we use.
//
// Everything above this speaks in { systemPrompt, userMessage,
// tools } and gets back { name, args }. Swapping Gemini for
// Anthropic, or a model on Groq, is a change to this file and
// nothing else — the task is intent-to-JSON, which any competent
// small model does, so we are not locked in. That isolation has
// already paid for itself once: when gemini-2.5-flash was retired
// for new users, the fix was one environment variable.
//
// FREE-TIER CAVEAT for handover: Google's free-tier terms permit
// using API inputs to improve their models, and a manager's question
// will routinely contain an ECD centre name. Organisation data, not
// personal data, but a reason to move to a billed key if it ever
// matters.
// ─────────────────────────────────────────────────────────────

// Lite models by default. Measured on this project's key (Sep 2026):
// gemini-3.6-flash answered 1 of 6 questions (the rest 429/503),
// gemini-3.5-flash-lite 6 of 6, all routed to the right report, with a
// median of ~1.5s. On the free tier the full flash models are the ones
// that run out of capacity.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

// FALLBACK CHAIN
// Free-tier limits are counted PER MODEL, so when one model is out of
// quota (429) or overloaded (503), the next one usually is not. On
// those, or a timeout, the request moves straight on to the next
// model instead of waiting and retrying the busy one. Comma-separated;
// set GEMINI_FALLBACK_MODELS= (empty) to turn the chain off.
const DEFAULT_FALLBACKS = 'gemini-3.1-flash-lite,gemini-flash-lite-latest';

const modelChain = () => {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const raw = process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACKS;
  const rest = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([primary, ...rest])];
};

// Per model attempt. Lite models answer in a few seconds; 12s is
// generous for them and keeps the worst case (three models timing
// out) near the half-minute mark rather than over a minute.
// Overridable, because this is exactly the kind of number that needs
// tuning in the field without a deploy.
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 12_000;

// A short pause before trying the next model, only after a 5xx blip —
// a 429 on one model says nothing about the next, so that moves on
// at once.
const BACKOFF_MS = 400;

export const isEnabled = () => Boolean(process.env.GEMINI_API_KEY);

export const providerName = () =>
  `google:${process.env.GEMINI_MODEL || DEFAULT_MODEL}`;

export const fallbackModels = () => modelChain().slice(1);

// `code` is additive and optional: the message and status are
// unchanged, so reporting reads exactly as before. It exists because
// these messages are written for the REPORTING screen — they end
// "use the report builder below", which is nonsense in the help
// panel, where there is no report builder. The code lets a second
// caller say the same thing in its own words without either of them
// parsing the other's prose.
const fail = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Statuses worth trying the NEXT MODEL on. 429 is that model's quota,
// 503 an overloaded model, 500 an internal blip, 504 a timeout, 404 a
// model retired or not offered to this key. A 400 is our request being
// wrong and would fail identically on every model.
const TRY_NEXT = new Set([404, 429, 500, 503, 504]);

const oneAttempt = async ({ url, apiKey, body }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body,
    });

    if (res.ok) return { ok: true, data: await res.json() };

    const text = await res.text().catch(() => '');
    console.error('[ai.provider]', res.status, text.slice(0, 300));

    // No Retry-After wait: a throttled model is skipped for the next
    // one in the chain rather than waited on.
    return { ok: false, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    // AbortError is our own timeout firing, which is worth one more
    // go: a slow response is often a busy model rather than a broken
    // one.
    if (err.name === 'AbortError') return { ok: false, status: 504, timedOut: true };
    return { ok: false, status: 0, networkError: true };
  } finally {
    clearTimeout(timer);
  }
};

// Forces a function call rather than free text. mode 'ANY' means the
// model MUST pick one of the declared functions, so there is no
// prose-parsing path and no "the model replied with an apology"
// failure mode to handle.
export const callWithTools = async ({ systemPrompt, userMessage, tools }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw fail(503, 'The AI assistant is not configured.', 'model_missing');

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    tools: [{ functionDeclarations: tools }],
    toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    // Deterministic: the same question must resolve to the same
    // report every time, or a manager comparing two runs of "last
    // month's compliance" gets two answers.
    generationConfig: { temperature: 0, candidateCount: 1 },
  });

  let last = null;
  const chain = modelChain();

  for (let i = 0; i < chain.length; i += 1) {
    const model = chain[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const result = await oneAttempt({ url, apiKey, body });

    if (result.ok) {
      // Parts may mix text and functionCall. Find by type, not
      // position — ordering is not guaranteed.
      const parts = result.data?.candidates?.[0]?.content?.parts ?? [];
      const call = parts.find((p) => p.functionCall)?.functionCall;
      if (call?.name) {
        if (i > 0) console.warn(`[ai.provider] answered by fallback model ${model}`);
        return { name: call.name, args: call.args ?? {}, model };
      }
      // A reply with no function call is this model misbehaving, not
      // the request being wrong: the next model may do better.
      last = { ok: false, status: 502, unusable: true };
      continue;
    }

    last = result;
    if (!(TRY_NEXT.has(result.status) || result.networkError || result.timedOut)) break;
    if (i === chain.length - 1) break;

    console.warn(`[ai.provider] ${model} failed (${result.status || 'network'}); trying ${chain[i + 1]}`);
    if (result.status >= 500) await sleep(BACKOFF_MS);
  }

  if (last?.unusable) throw fail(502, 'The AI assistant did not return a usable answer.', 'error');

  // Every message below is written for the manager, not the log, and
  // the controller passes 502/503/504 text through to the screen.
  // Each one says whether waiting will help.
  if (last.status === 429) {
    throw fail(429, 'The AI assistant has hit its usage limit for now. Use the report builder below.', 'rate_limit');
  }
  if (last.status === 503 || last.status === 500) {
    throw fail(503, 'The AI assistant is busy right now — this usually clears in a minute. Try again, or use the report builder below.', 'busy');
  }
  if (last.status === 504 || last.timedOut) {
    throw fail(504, 'The AI assistant took too long to respond. Try again, or use the report builder below.', 'timeout');
  }
  if (last.networkError) {
    throw fail(502, 'Could not reach the AI assistant. Check the connection, or use the report builder below.', 'unreachable');
  }
  if (last.status === 404) {
    // Distinct because the fix is a config change, not a retry — and
    // this is how the last model retirement surfaced. Reaching here
    // means every model in the chain was unavailable.
    throw fail(502, 'The configured AI models are not available. Check GEMINI_MODEL and GEMINI_FALLBACK_MODELS on the server.', 'model_missing');
  }
  throw fail(502, 'The AI assistant returned an error.', 'error');
};

export default { isEnabled, providerName, fallbackModels, callWithTools };
