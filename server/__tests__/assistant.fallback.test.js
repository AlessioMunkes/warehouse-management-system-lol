// ─────────────────────────────────────────────────────────────
// server/__tests__/assistant.fallback.test.js
//
// The help panel shares reporting's provider, and with it the chain
// of backup models. The other assistant tests mock the provider out;
// this one keeps it real and fakes only the network, so it proves
// the thing that matters on a busy free-tier day: when the first
// model is out of quota, overloaded or slow, the panel still answers
// from the next one — and when every model is down, the person reads
// a sentence meant for them, not a stack trace.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/repositories/assistantLog.repository.js', () => ({
  default: { record: vi.fn().mockResolvedValue(undefined) },
}));

// The service asks this for the names to keep out of the prompt, and it
// reads them from the database. No database in a unit test.
vi.mock('../src/repositories/knownPeople.repository.js', () => ({
  default: { listNames: vi.fn(async () => ({ names: [], keep: new Set() })) },
}));

const { ask } = await import('../src/services/assistant.service.js');

const modelOf = (url) => String(url).match(/models\/([^:]+):/)[1];

const reply = (name, args) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] }),
});
const status = (code) => ({ ok: false, status: code, text: async () => '' });

const askWorker = (question = 'the truck is here what do I do') =>
  ask({ question, screen: 'home', userId: 1, role: 'warehouse_worker' });

let calls;
const answerWith = (byModel) => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const model = modelOf(url);
    calls.push(model);
    return byModel(model);
  }));
};

beforeEach(() => {
  calls = [];
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('GEMINI_MODEL', 'primary-model');
  vi.stubEnv('GEMINI_FALLBACK_MODELS', 'backup-one,backup-two');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the help panel falls back to backup models', () => {
  it('answers from the first model when it is fine', async () => {
    answerWith(() => reply('explain_topic', { topic_id: 'receiving-record' }));
    const res = await askWorker();
    expect(res.topic.id).toBe('receiving-record');
    expect(calls).toEqual(['primary-model']);
  });

  it.each([
    [429, 'out of quota'],
    [503, 'overloaded'],
    [504, 'timed out'],
    [404, 'retired'],
  ])('moves to the next model when the first is %i (%s)', async (code) => {
    answerWith((m) => (m === 'primary-model' ? status(code) : reply('explain_topic', { topic_id: 'receiving-record' })));
    const res = await askWorker();
    expect(res.topic.id).toBe('receiving-record');
    expect(calls).toEqual(['primary-model', 'backup-one']);
  });

  it('goes all the way down the chain', async () => {
    answerWith((m) => (m === 'backup-two' ? reply('open_screen', { screen_id: 'receiving' }) : status(429)));
    const res = await askWorker('take me to receiving');
    expect(res).toMatchObject({ type: 'navigate', screen: { id: 'receiving' } });
    expect(calls).toEqual(['primary-model', 'backup-one', 'backup-two']);
  });

  it('moves on when a model replies without choosing anything', async () => {
    answerWith((m) => (m === 'primary-model'
      ? { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }) }
      : reply('explain_topic', { topic_id: 'receiving-record' })));
    const res = await askWorker();
    expect(res.topic.id).toBe('receiving-record');
  });

  it('does not try a backup for a bad request, which none of them would fix', async () => {
    answerWith(() => status(400));
    await expect(askWorker()).rejects.toMatchObject({ code: 'error' });
    expect(calls).toEqual(['primary-model']);
  });
});

describe('when every model is down', () => {
  it.each([
    [429, 'rate_limit', /answered a lot of questions/],
    [503, 'busy',       /busy right now/],
    [504, 'timeout',    /took too long/],
  ])('%i says so in the panel’s own words', async (code, errCode, text) => {
    answerWith(() => status(code));
    const err = await askWorker().catch((e) => e);
    expect(err.code).toBe(errCode);
    expect(err.message).toMatch(text);
    // Not reporting's wording: there is no report builder in the panel.
    expect(err.message).not.toMatch(/report builder/);
    // Tried each model once, and did not spend the quota again on a retry.
    expect(calls).toEqual(['primary-model', 'backup-one', 'backup-two']);
  });
});
