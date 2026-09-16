// ─────────────────────────────────────────────────────────────
// server/scripts/testAssistant.js
//
// Puts real questions to the real model with the real tool schema,
// and prints which help topic each one resolved to.
//
// This exists because a failure in the panel could be the key, the
// model name, the tool schema, the role scoping or our own code, and
// the panel cannot tell you which. This can. Same job as
// testGemini.js does for reporting.
//
// It is also the only honest way to answer "does it actually work".
// The unit tests prove the model CANNOT say anything outside the
// catalog; they cannot prove it picks the RIGHT thing, because that
// depends on the model. So this asks in the words a warehouse worker
// would use, and you read the answers.
//
//     node server/scripts/testAssistant.js
//     node server/scripts/testAssistant.js warehouse_worker
//     node server/scripts/testAssistant.js manager "how do I order more maize"
// ─────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs';

// Minimal .env reader — this runs outside the app, so it must not
// depend on however index.js happens to load config.
for (const file of ['.env.local', '.env', 'server/.env.local', 'server/.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { buildTools, buildSystemPrompt } = await import('../src/features/assistant/ai/toolSchema.js');
const { getTopic, topicsForRole, screensForRole, screenForRole } =
  await import('../src/features/assistant/helpCatalog.js');

const key   = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const role  = process.argv[2] || 'warehouse_worker';

// Written the way the people who need this actually talk. If these
// do not resolve sensibly, the `asks` lines in helpCatalog.js are
// what to fix — not the prompt.
const DEFAULT_QUESTIONS = {
  warehouse_worker: [
    ['what are you able to do',                      'assistant-what-i-do'],
    ['the truck is here what do I do',               'receiving-record'],
    ['we got less than the order said',              'receiving-discrepancy'],
    ['which box do I take first',                    'fifo-fefo'],
    ['the driver wont sign',                         'dispatch-signature'],
    ['nobody came to fetch their stuff',             'dispatch-non-collection'],
    ['I dropped a bag of rice will I get in trouble', 'decanting-wastage'],
    ['my tablet died halfway through counting',      'unfinished-work'],
    ['theres no wifi in the cold room',              'working-offline'],
    ['someone phoned asking for a food parcel',      'benevolent-requests'],
    ['this number looks wrong who do I tell',        'something-looks-wrong'],
    // Navigation, to screens a worker is allowed.
    ['take me to receiving',                         'open_screen'],
    ['open the dispatch gate',                       'open_screen'],
    // Navigation to screens a worker is NOT allowed. The screen is
    // not in their enum at all, so the honest answers are a topic
    // about permissions or not_covered — never open_screen.
    ['take me to the inventory screen',              'who-can-do-what or not_covered'],
    ['open product management',                      'master-data-admin-only or who-can-do-what or not_covered'],
    ['what is the capital of france',                'not_covered'],
  ],
  manager: [
    ['what can you do',                              'assistant-what-i-do'],
    ['we are running low on maize',                  'po-create'],
    ['why did the weight change when I typed a price', 'po-line-numbers'],
    ['what does returned mean on an order',          'po-status'],
    ['how many children did we feed last month',     'reporting-impact or reporting-ask'],
    ['a creche stopped collecting',                  'beneficiary-inactive or beneficiary-manage'],
    ['where did the stock go',                       'stock-ledger'],
    ['some of the rice has gone off',                'expired-stock'],
    ['take me to inventory',                         'open_screen'],
    ['show me the purchase orders',                  'open_screen'],
    ['open user management',                         'who-can-do-what or master-data-admin-only or not_covered'],
  ],
  admin: [
    ['someone left the organisation',                'users-and-accounts'],
    ['I want to get rid of an old product',          'archive-not-delete'],
    ['where do I set what something costs',          'product-fields'],
    ['a donor wants their tax certificate',          'section18a-certificates or donation-18a'],
    ['emails have stopped going out',                'email-settings'],
    ['take me to product management',                'open_screen'],
  ],
};

console.log('─'.repeat(64));
console.log('key   :', key ? `${key.slice(0, 8)}…${key.slice(-4)} (${key.length} chars)` : 'NOT SET');
console.log('model :', model);
console.log('role  :', role, `(${topicsForRole(role).length} topics visible)`);
console.log('─'.repeat(64));

if (!key) {
  console.error('\nGEMINI_API_KEY is not set. Add it to server/.env.local');
  process.exit(1);
}

const tools  = buildTools(role);
const system = buildSystemPrompt(role);

const questions = process.argv[3]
  ? [[process.argv.slice(3).join(' '), '?']]
  : (DEFAULT_QUESTIONS[role] ?? DEFAULT_QUESTIONS.warehouse_worker);

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

let ok = 0;
let leaks = 0;
for (const [question, expected] of questions) {
  let res;
  try {
    res = await fetch(`${url}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
        generationConfig: { temperature: 0, candidateCount: 1 },
      }),
    });
  } catch (err) {
    console.log(`\n✗ ${question}\n  network: ${err.message}`);
    continue;
  }

  const text = await res.text();
  if (!res.ok) {
    console.log(`\n✗ ${question}\n  HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (res.status === 403) console.log('  403 → the key is invalid, or the API is not enabled.');
    if (res.status === 404) console.log('  404 → GEMINI_MODEL is not available to this key.');
    if (res.status === 429) console.log('  429 → free-tier quota. Wait and try again.');
    break;
  }

  const parts = JSON.parse(text)?.candidates?.[0]?.content?.parts ?? [];
  const call  = parts.find((p) => p.functionCall)?.functionCall;

  if (!call) {
    console.log(`\n✗ ${question}\n  no function call returned`);
    continue;
  }

  let got = call.name;
  let leak = false;

  if (call.name === 'explain_topic') {
    const topic = getTopic(call.args?.topic_id);
    // The service enforces this too. Seeing it here means the prompt
    // leaked a topic the enum should have excluded.
    leak = !(topic && topic.roles.includes(role));
    got = `${call.args?.topic_id}${leak ? '  ** NOT ALLOWED FOR THIS ROLE **' : ''}`;
  } else if (call.name === 'open_screen') {
    // The one that matters now the assistant can navigate. The
    // service refuses this anyway, but seeing it here means the enum
    // handed the model a screen it should never have known about.
    leak = !screenForRole(call.args?.screen_id, role);
    got = `-> opens ${call.args?.screen_id}${leak ? '  ** NOT ALLOWED FOR THIS ROLE **' : ''}`;
  } else if (call.name === 'ask_clarification') {
    got = `asks back: "${call.args?.question}" ${JSON.stringify(call.args?.options)}`;
  }

  if (leak) leaks += 1;

  const hit = !leak && (
    expected === '?' ||
    expected.includes(String(call.args?.topic_id)) ||
    expected.includes(call.name)
  );
  if (hit) ok += 1;
  console.log(`\n${leak ? 'X' : hit ? 'ok' : ' .'} ${question}`);
  console.log(`  got      : ${got}`);
  if (expected !== '?') console.log(`  expected : ${expected}`);
}

console.log('\n' + '─'.repeat(64));
console.log(`${ok}/${questions.length} resolved as expected.`);
console.log('A miss is usually a missing phrasing in helpCatalog.js `asks`,');
console.log('not a prompt problem. Add how someone really said it and re-run.');
console.log('');
if (leaks > 0) {
  console.log(`** ${leaks} answer(s) named something this role may not have. **`);
  console.log('The service refuses these, so nothing reached a user — but the');
  console.log('enum in ai/toolSchema.js should not have offered them at all.');
  console.log('That is a real bug, not a tuning problem.');
} else {
  console.log(`No role leaks: nothing offered outside this role's ${topicsForRole(role).length} topics`);
  console.log(`and ${screensForRole(role).length} screens.`);
}
