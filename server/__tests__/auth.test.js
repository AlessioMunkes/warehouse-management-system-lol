// ─────────────────────────────────────────────────────────────
// server/__tests__/auth.test.js
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt  from 'bcrypt';

const PASSWORD      = 'CorrectHorseBattery123!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4); // low cost factor — speed, not security, matters here

const queryMock = vi.fn();

vi.mock('../src/config/db.js', () => ({
  default: { query: (...args) => queryMock(...args) },
}));

// Each test gets a brand-new module instance of the login route +
// rate limiter, so the in-memory rate-limit counter never bleeds
// between tests — only the "11 attempts" test needs 11 requests
// on its own limiter to hit 429.
const getFreshApp = async () => {
  vi.resetModules();
  const { buildLoginApp } = await import('./helpers/loginApp.js');
  return buildLoginApp();
};

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({
    rows: [{
      id:            1,
      username:      'JDOE',
      first_name:    'Jane',
      last_name:     'Doe',
      role:          'warehouse_worker',
      password_hash: PASSWORD_HASH,
    }],
  });
});

describe('POST /api/login', () => {
  it('returns 200 and sets an httpOnly cookie for valid credentials', async () => {
    const app = await getFreshApp();
    const res = await request(app).post('/api/login').send({ username: 'jdoe', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('wms_token='))).toBe(true);
  });

  it('returns 401 for the wrong password', async () => {
    const app = await getFreshApp();
    const res = await request(app).post('/api/login').send({ username: 'jdoe', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when username or password is missing', async () => {
    const app = await getFreshApp();
    const res = await request(app).post('/api/login').send({ username: 'jdoe' });

    expect(res.status).toBe(400);
  });

  it('returns 429 after 11 attempts from the same IP', async () => {
    const app = await getFreshApp();

    let lastResponse;
    for (let i = 0; i < 11; i++) {
      lastResponse = await request(app).post('/api/login').send({ username: 'jdoe', password: 'wrong-password' });
    }

    expect(lastResponse.status).toBe(429);
  });
});
