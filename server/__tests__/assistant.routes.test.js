// ─────────────────────────────────────────────────────────────
// server/__tests__/assistant.routes.test.js
//
// Who can reach the assistant, and what the HTTP layer does with
// what the service gives it.
//
// The service is mocked: assistant.routes.js pulls in the
// controller/service/repository chain, and assistantLog.repository.js
// imports config/db.js, which process.exit(1)s without DATABASE_URL.
// Same pattern as user.routes.test.js.
//
// The gate being tested is deliberately WIDER than reporting's. A
// warehouse worker is the primary user of a help agent — R3 and R13
// are both about floor staff — so a test that a worker gets in is
// pinning the point of the feature, not an incidental permission.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';

const serviceMock = {
  ask: vi.fn(),
  getCatalog: vi.fn(),
  getTopicForRole: vi.fn(),
};
vi.mock('../src/services/assistant.service.js', () => ({ default: serviceMock }));

const { buildAssistantApp } = await import('./helpers/assistantApp.js');
const app  = buildAssistantApp();
const BASE = '/api/assistant';

const cookieFor = (role) => [
  `wms_token=${jwt.sign({ id: 7, username: 't', role }, process.env.JWT_SECRET)}`,
];

const STAFF = ['warehouse_worker', 'manager', 'admin'];

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.getCatalog.mockReturnValue({ enabled: true, screens: [], topics: [], suggestions: {} });
  serviceMock.getTopicForRole.mockReturnValue({ type: 'topic', topic: { id: 'x', title: 'X' } });
  serviceMock.ask.mockResolvedValue({ type: 'topic', topic: { id: 'x', title: 'X' } });
});

describe('who can reach the help assistant', () => {
  it('turns away someone who is not signed in', async () => {
    await request(app).get(`${BASE}/catalog`).expect(401);
    await request(app).post(`${BASE}/ask`).send({ question: 'how do I receive' }).expect(401);
  });

  // The whole point of the feature. A help agent gated to managers
  // mitigates neither R3 nor R13.
  it.each(STAFF)('lets a %s ask', async (role) => {
    await request(app)
      .post(`${BASE}/ask`)
      .set('Cookie', cookieFor(role))
      .send({ question: 'how do I receive a delivery' })
      .expect(200);
  });

  it.each(STAFF)('lets a %s read the catalog', async (role) => {
    await request(app).get(`${BASE}/catalog`).set('Cookie', cookieFor(role)).expect(200);
  });

  // A guest is a volunteer signed in with a first name for one
  // event. One screen, nothing to guide, and the obvious way to
  // spend the shared AI quota from a near-anonymous session.
  it('turns away a guest', async () => {
    await request(app)
      .post(`${BASE}/ask`)
      .set('Cookie', cookieFor('guest'))
      .send({ question: 'how do I receive a delivery' })
      .expect(403);
    await request(app).get(`${BASE}/catalog`).set('Cookie', cookieFor('guest')).expect(403);
  });
});

describe('what the service is told about the asker', () => {
  it('passes the signed-in role and id from the token, not the body', async () => {
    await request(app)
      .post(`${BASE}/ask`)
      .set('Cookie', cookieFor('warehouse_worker'))
      .send({
        question: 'how do I add a product',
        screen: 'receiving',
        // A client that asks nicely for more access gets none: the
        // role comes off the verified JWT.
        role: 'admin',
        userId: 999,
      })
      .expect(200);

    expect(serviceMock.ask).toHaveBeenCalledWith({
      question: 'how do I add a product',
      screen: 'receiving',
      userId: 7,
      role: 'warehouse_worker',
    });
  });

  it('scopes the catalog to the signed-in role', async () => {
    await request(app).get(`${BASE}/catalog`).set('Cookie', cookieFor('manager')).expect(200);
    expect(serviceMock.getCatalog).toHaveBeenCalledWith('manager');
  });

  it('scopes a single topic to the signed-in role', async () => {
    await request(app)
      .get(`${BASE}/topic/receiving-record`)
      .set('Cookie', cookieFor('warehouse_worker'))
      .expect(200);
    expect(serviceMock.getTopicForRole).toHaveBeenCalledWith('receiving-record', 'warehouse_worker');
  });
});

describe('what comes back', () => {
  it.each([
    ['topic',       { type: 'topic', topic: { id: 'receiving-record', title: 'Recording a delivery' } }],
    ['navigate',    { type: 'navigate', screen: { id: 'inventory', label: 'Inventory' } }],
    ['clarify',     { type: 'clarify', question: 'Which one?', options: ['A', 'B'] }],
    ['not_covered', { type: 'not_covered', closest: null }],
  ])('passes a %s answer through untouched', async (_name, payload) => {
    serviceMock.ask.mockResolvedValue(payload);
    const res = await request(app)
      .post(`${BASE}/ask`)
      .set('Cookie', cookieFor('manager'))
      .send({ question: 'anything' })
      .expect(200);
    expect(res.body).toEqual({ success: true, data: payload });
  });
});

describe('when something goes wrong', () => {
  const failWith = (status, message) => {
    const err = new Error(message);
    err.status = status;
    serviceMock.ask.mockRejectedValue(err);
  };

  it('shows a 4xx message, because it tells the user what to do', async () => {
    failWith(400, 'Type a few more words and I will have a better go at it.');
    const res = await request(app)
      .post(`${BASE}/ask`).set('Cookie', cookieFor('manager')).send({ question: 'a' })
      .expect(400);
    expect(res.body.message).toMatch(/few more words/);
  });

  // provider.js raises these for upstream conditions with messages
  // written for the reader — "busy right now, try again shortly".
  // Masking them turns something actionable into a dead end.
  it.each([502, 503, 504])('shows the %d message from the provider', async (status) => {
    failWith(status, 'The assistant is busy right now.');
    const res = await request(app)
      .post(`${BASE}/ask`).set('Cookie', cookieFor('manager')).send({ question: 'anything' })
      .expect(status);
    expect(res.body.message).toBe('The assistant is busy right now.');
  });

  // A genuine 500 is our own bug. Its message is useless to the user
  // and may disclose internals, so it is replaced — but the
  // replacement still says what to do next.
  it('hides a 500 behind advice rather than a stack trace', async () => {
    serviceMock.ask.mockRejectedValue(new Error('column "topic_id" does not exist'));
    const res = await request(app)
      .post(`${BASE}/ask`).set('Cookie', cookieFor('manager')).send({ question: 'anything' })
      .expect(500);
    expect(res.body.message).not.toMatch(/column/);
    expect(res.body.message).toMatch(/ask your manager/i);
  });

  it('404s a topic id that does not exist', async () => {
    const err = new Error('That help topic does not exist.');
    err.status = 404;
    serviceMock.getTopicForRole.mockImplementation(() => { throw err; });
    await request(app)
      .get(`${BASE}/topic/nonsense`).set('Cookie', cookieFor('manager'))
      .expect(404);
  });
});
