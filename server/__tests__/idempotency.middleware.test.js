// ─────────────────────────────────────────────────────────────
// server/__tests__/idempotency.middleware.test.js
//
// A submission sent twice is done once: the first arrival does the
// work and its answer is kept, a repeat is handed that answer back.
// The table is a Map here; the middleware only ever runs four
// statements against it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const table = new Map();
let broken = false;
const poolMock = {
  query: vi.fn(async (sql, params = []) => {
    if (broken) throw new Error('relation "idempotency_keys" does not exist');
    if (/^INSERT INTO idempotency_keys/.test(sql)) {
      if (table.has(params[0])) return { rows: [] };
      table.set(params[0], { scope: params[1], user_id: params[2], status_code: null, response: null });
      return { rows: [{ key: params[0] }] };
    }
    if (/^SELECT scope/.test(sql)) return { rows: table.has(params[0]) ? [table.get(params[0])] : [] };
    if (/^UPDATE idempotency_keys/.test(sql)) {
      Object.assign(table.get(params[0]), { status_code: params[1], response: JSON.parse(params[2]) });
      return { rows: [] };
    }
    if (/^DELETE FROM idempotency_keys WHERE key/.test(sql)) { table.delete(params[0]); return { rows: [] }; }
    return { rows: [] };
  }),
};
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { idempotent } = await import('../src/middleware/idempotency.middleware.js');

const KEY = '3f2b8c1e-9a4d-4c6b-8e1f-0a2b3c4d5e6f';
const work = vi.fn();
const build = (userId = 7) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.post('/sheets', idempotent('decanting'), (req, res) => {
    const outcome = work(req.body);
    res.status(outcome?.status ?? 201).json(outcome?.body ?? { success: true, data: { id: 41 } });
  });
  app.post('/other', idempotent('picking.confirm'), (req, res) => { work(req.body); res.json({ success: true }); });
  return app;
};

beforeEach(() => { table.clear(); broken = false; work.mockReset(); vi.clearAllMocks(); });

describe('idempotent()', () => {
  it('does the work once and hands a repeat the first answer', async () => {
    const app = build();
    const first = await request(app).post('/sheets').send({ kg: 5, idempotencyKey: KEY });
    const again = await request(app).post('/sheets').send({ kg: 5, idempotencyKey: KEY });

    expect(first.status).toBe(201);
    expect(first.body).toEqual({ success: true, data: { id: 41 } });
    expect(again.status).toBe(201);
    expect(again.body).toEqual({ success: true, data: { id: 41 }, duplicate: true });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('leaves a request with no key exactly as it was', async () => {
    const app = build();
    await request(app).post('/sheets').send({ kg: 5 });
    await request(app).post('/sheets').send({ kg: 5 });
    expect(work).toHaveBeenCalledTimes(2);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('forgets a failed attempt, so it can be sent again once fixed', async () => {
    const app = build();
    work.mockReturnValueOnce({ status: 400, body: { success: false, message: 'Enter the bulk weight.' } });
    const refused = await request(app).post('/sheets').send({ idempotencyKey: KEY });
    expect(refused.status).toBe(400);
    expect(table.has(KEY)).toBe(false);

    const retried = await request(app).post('/sheets').send({ kg: 5, idempotencyKey: KEY });
    expect(retried.status).toBe(201);
    expect(retried.body.duplicate).toBeUndefined();
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('refuses a key already used by someone else or for something else', async () => {
    await request(build(7)).post('/sheets').send({ idempotencyKey: KEY });

    const otherPerson = await request(build(8)).post('/sheets').send({ idempotencyKey: KEY });
    expect(otherPerson.status).toBe(409);
    const otherThing = await request(build(7)).post('/other').send({ idempotencyKey: KEY });
    expect(otherThing.status).toBe(409);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('says so when the first attempt is still running', async () => {
    table.set(KEY, { scope: 'decanting', user_id: 7, status_code: null, response: null });
    const res = await request(build()).post('/sheets').send({ idempotencyKey: KEY });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already being saved/);
    expect(work).not.toHaveBeenCalled();
  });

  it('refuses a key that is not shaped like one', async () => {
    const res = await request(build()).post('/sheets').send({ idempotencyKey: 'x y' });
    expect(res.status).toBe(400);
    expect(work).not.toHaveBeenCalled();
  });

  it('does the work anyway when the table cannot be read', async () => {
    broken = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(build()).post('/sheets').send({ kg: 5, idempotencyKey: KEY });
    expect(res.status).toBe(201);
    expect(work).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
