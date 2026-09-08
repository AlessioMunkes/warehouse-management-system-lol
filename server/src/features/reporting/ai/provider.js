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

const DEFAULT_MODEL = 'gemini-3.6-flash';

// Per attempt, not per request. The system prompt now describes 19
// reports — roughly 2,500 tokens — and a loaded free-tier model can
// take well over ten seconds to work through it. Overridable because
// this is exactly the kind of number that needs tuning in the field
// without a deploy.
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 25_000;

// One retry only. A 503 means the model is busy, and a brief pause
// usually clears it — but the manager is watching a spinner, so the
// worst case has to stay bounded at roughly one minute rather than
// climbing through an exponential ladder.
const MAX_ATTEMPTS = 2;
const BACKOFF_MS   = 1_500;

export const isEnabled = () => Boolean(process.env.GEMINI_API_KEY);

export const providerName = () =>
  `google:${process.env.GEMINI_MODEL || DEFAULT_MODEL}`;

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Statuses worth trying again. 503 is an overloaded model, 500 is an
// occasional internal blip, 504 is a gateway timeout. A 400 or 404 is
// our request being wrong and will fail identically every time, so
// retrying those just makes the user wait longer for the same error.
const RETRYABLE = new Set([500, 503, 504]);

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

    // Google sends Retry-After on some throttles. Honouring it beats
    // guessing, and ignoring it is how a client gets rate-limited
    // harder.
    const retryAfter = Number(res.headers.get('retry-after'));
    return {
      ok: false,
      status: res.status,
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
    };
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
  if (!apiKey) throw fail(503, 'The AI assistant is not configured.');

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await oneAttempt({ url, apiKey, body });

    if (result.ok) {
      // Parts may mix text and functionCall. Find by type, not
      // position — ordering is not guaranteed.
      const parts = result.data?.candidates?.[0]?.content?.parts ?? [];
      const call = parts.find((p) => p.functionCall)?.functionCall;
      if (!call?.name) throw fail(502, 'The AI assistant did not return a usable answer.');
      return { name: call.name, args: call.args ?? {} };
    }

    last = result;

    const worthRetrying = RETRYABLE.has(result.status) || result.networkError;
    if (!worthRetrying || attempt === MAX_ATTEMPTS) break;

    const wait = result.retryAfterMs ?? BACKOFF_MS;
    console.warn(`[ai.provider] attempt ${attempt} failed (${result.status}); retrying in ${wait}ms`);
    await sleep(wait);
  }

  // Every message below is written for the manager, not the log, and
  // the controller passes 502/503/504 text through to the screen.
  // Each one says whether waiting will help.
  if (last.status === 429) {
    throw fail(429, 'The AI assistant has hit its usage limit for now. Use the report builder below.');
  }
  if (last.status === 503 || last.status === 500) {
    throw fail(503, 'The AI assistant is busy right now — this usually clears in a minute. Try again, or use the report builder below.');
  }
  if (last.status === 504 || last.timedOut) {
    throw fail(504, 'The AI assistant took too long to respond. Try again, or use the report builder below.');
  }
  if (last.networkError) {
    throw fail(502, 'Could not reach the AI assistant. Check the connection, or use the report builder below.');
  }
  if (last.status === 404) {
    // Distinct because the fix is a config change, not a retry — and
    // this is how the last model retirement surfaced.
    throw fail(502, 'The configured AI model is not available. Check GEMINI_MODEL on the server.');
  }
  throw fail(502, 'The AI assistant returned an error.');
};

export default { isEnabled, providerName, callWithTools };
