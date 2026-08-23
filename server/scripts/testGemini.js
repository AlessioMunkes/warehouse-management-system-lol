// ─────────────────────────────────────────────────────────────
// server/scripts/testGemini.js
//
// Calls Gemini directly with your real key and the real generated
// tool schema, and prints whatever comes back.
//
// This exists because a failure in the UI could be the key, the
// model name, the tool schema, or our own code, and the UI cannot
// tell you which. This can.
//
//     node server/scripts/testGemini.js
//     node server/scripts/testGemini.js "how much food went out in July?"
// ─────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs';
import { buildTools, buildSystemPrompt } from '../src/features/reporting/ai/toolSchema.js';

// Minimal .env reader — this runs outside the app, so it must not
// depend on however index.js happens to load config.
for (const file of ['.env.local', '.env', 'server/.env.local', 'server/.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const key   = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

console.log('─'.repeat(60));
console.log('key   :', key ? `${key.slice(0, 8)}…${key.slice(-4)} (${key.length} chars)` : 'NOT SET');
console.log('model :', model);
console.log('─'.repeat(60));

if (!key) {
  console.error('\nGEMINI_API_KEY is not set. Add it to server/.env.local');
  process.exit(1);
}

const question = process.argv[2] || 'Which products did we dispatch most of?';
const tools    = buildTools();
const today    = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);

console.log('\nquestion:', question, '\n');

// ── 1. Which models does this key actually have? ─────────────
// The commonest cause of a hard failure is a model name that is not
// available to this key, and the list endpoint answers that in one
// call without spending a request on generation.
try {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
  );
  if (!res.ok) {
    console.log('MODEL LIST FAILED:', res.status);
    console.log(await res.text());
    console.log('\nA 400 or 403 here means the key itself is the problem.');
    process.exit(1);
  }
  const { models = [] } = await res.json();
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace('models/', ''));

  console.log('models available to this key:');
  for (const m of usable.filter((n) => n.includes('flash'))) console.log('  ', m);

  if (!usable.includes(model)) {
    console.log(`\n⚠  "${model}" is NOT in that list.`);
    console.log('   Set GEMINI_MODEL in server/.env.local to one of the above.');
  } else {
    console.log(`\n✓  "${model}" is available.`);
  }
} catch (err) {
  console.log('Could not list models:', err.message);
}

// ── 2. The real call ─────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log('calling generateContent with the tool schema…\n');

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(today) }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      tools: [{ functionDeclarations: tools }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      generationConfig: { temperature: 0, candidateCount: 1 },
    }),
  }
);

const text = await res.text();

if (!res.ok) {
  console.log('HTTP', res.status, '\n');
  console.log(text.slice(0, 2000));
  console.log('\n' + '─'.repeat(60));
  console.log('400  → the request body was rejected. Usually the tool schema');
  console.log('       or the model name. The message above names the field.');
  console.log('403  → the key is invalid, or the API is not enabled.');
  console.log('429  → free-tier quota. Wait, or use the report builder.');
  process.exit(1);
}

const data = JSON.parse(text);
const parts = data?.candidates?.[0]?.content?.parts ?? [];
const call  = parts.find((p) => p.functionCall)?.functionCall;

if (!call) {
  console.log('No function call returned. Raw response:\n');
  console.log(JSON.stringify(data, null, 2).slice(0, 2000));
  process.exit(1);
}

console.log('✓ function :', call.name);
console.log('✓ arguments:', JSON.stringify(call.args, null, 2));

// ── 3. Would our validator accept it? ────────────────────────
// A valid Gemini response that the validator then rejects is a
// different bug from a failed API call, so check both here.
const { validateSpec } = await import('../src/features/reporting/specValidator.js');
const a = call.args;
try {
  const spec = validateSpec({
    metric: a.metric,
    dimension: a.dimension,
    filters: {
      ...(a.cohort ? { cohort: a.cohort } : {}),
      ...(a.beneficiary_kind ? { beneficiary_kind: a.beneficiary_kind } : {}),
    },
    dateRange: { from: a.date_from, to: a.date_to },
    limit: a.limit,
  });
  console.log('\n✓ validateSpec accepted it:');
  console.log(JSON.stringify(spec, null, 2));
  console.log('\nEnd to end this works — any UI failure is below the model.');
} catch (err) {
  console.log('\n⚠ validateSpec rejected it:', err.message);
  console.log('  The API call is fine; the model picked an invalid combination.');
  console.log('  In the app this triggers one retry with that message attached.');
}
