// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/ai/provider.js
//
// The ONLY file that knows which AI provider we use.
//
// Everything above this speaks in { systemPrompt, userMessage,
// tools } and gets back { name, args }. Swapping Gemini for
// Anthropic, or for a model on Groq, is a change to this file and
// nothing else — the task is intent-to-JSON, which any competent
// small model does, so we are not locked in.
//
// WHY GEMINI FOR NOW
// The free tier needs no card and allows far more requests per day
// than a manager asking a handful of questions. At realistic volume
// the paid equivalent would run under a dollar a month, so the real
// decision at handover is who owns the account, not what it costs.
// See docs — that decision is deliberately deferred, and the feature
// flag below is what makes deferring it safe.
//
// FREE-TIER CAVEAT worth knowing at handover: Google's free-tier
// terms permit using API inputs to improve their models, and a
// manager's question will routinely contain an ECD centre name.
// That is organisation data, not personal data, but it is a reason
// to move to a billed key if this ever becomes a real concern.
// ─────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gemini-3.6-flash';

// Render cold-starts and the free tier throttles. Ten seconds is
// long enough for a slow response and short enough that the manager
// gets an error rather than a hung page.
const TIMEOUT_MS = 10_000;

// The whole feature hangs off this. No key means /ask returns 503,
// the client hides the input, and the dropdown builder carries on
// untouched — which is the point. When the key lapses after
// handover the system degrades, it does not break.
export const isEnabled = () => Boolean(process.env.GEMINI_API_KEY);

export const providerName = () =>
  `google:${process.env.GEMINI_MODEL || DEFAULT_MODEL}`;

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// ── callWithTools ─────────────────────────────────────────────
// Forces a function call rather than free text. mode: 'ANY' means
// the model MUST pick one of the declared functions, so there is no
// prose-parsing path and no "the model replied with an apology"
// failure mode to handle.
export const callWithTools = async ({ systemPrompt, userMessage, tools }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw fail(503, 'The AI assistant is not configured.');

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
        // Deterministic. The same question should resolve to the
        // same report every time — a manager comparing two runs of
        // "last month's compliance" must not get two answers.
        generationConfig: { temperature: 0, candidateCount: 1 },
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw fail(504, 'The AI assistant took too long to respond. Try the report builder below.');
    }
    throw fail(502, 'Could not reach the AI assistant.');
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[ai.provider]', res.status, body.slice(0, 400));
    // 429 is the free tier's daily or per-minute cap. Say so plainly
    // rather than showing a generic failure, because the fix is to
    // wait or use the builder, not to retry immediately.
    if (res.status === 429) {
      throw fail(429, 'The AI assistant has hit its usage limit for now. Use the report builder below.');
    }
    throw fail(502, 'The AI assistant returned an error.');
  }

  const data = await res.json();

  // Gemini returns parts that may mix text and functionCall. Find by
  // type rather than position — ordering is not guaranteed.
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const call = parts.find((p) => p.functionCall)?.functionCall;

  if (!call?.name) {
    throw fail(502, 'The AI assistant did not return a usable answer.');
  }

  return { name: call.name, args: call.args ?? {} };
};

export default { isEnabled, providerName, callWithTools };
