// ─────────────────────────────────────────────────────────────
// server/__tests__/multiWarehousePublic.test.js
//
// Script 51: requests with no staff login in multi-warehouse mode —
// public links find their own warehouse, guest sessions stay in one,
// the landing-page counters add every site up, and a username cannot
// be reused at another site. db.js is a fake that answers from the
// active warehouse, like the real router.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { currentWarehouse, runInWarehouse } from '../src/config/warehouseContext.js';

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const SLIP_CPT = '11111111-2222-3333-4444-5555550abcde';
const SLIP_GP = '99999999-2222-3333-4444-555555fedcba';
const SLIP_GP_SAME_CODE = '77777777-2222-3333-4444-5555550abcde'; // same last 6 as SLIP_CPT
const INVITE = 'inviteTokenForGautengOnly_1234567890abcdef';
const FORM = 'donorFormTokenNorthernCape_1234567890';

let data;
const reset = () => {
  data = {
    cpt: { slips: [SLIP_CPT], invites: [], forms: [], users: [{ username: 'grizel', id: 4, is_active: true }],
      impact: { paper: 10, compost: 20, children: 30 } },
    gauteng: { slips: [SLIP_GP], invites: [sha(INVITE)], forms: [], users: [{ username: 'lindiwe', id: 2, is_active: true }],
      impact: { paper: 1, compost: 2, children: 3 } },
    'northern-cape': { slips: [], invites: [], forms: [sha(FORM)], users: [],
      impact: { paper: 100, compost: 200, children: 300 } },
  };
};
const down = new Set();

const fakeQuery = vi.fn(async (sql, params = []) => {
  const wh = currentWarehouse();
  if (!wh) throw new Error('[db] Query attempted with no active warehouse.');
  if (down.has(wh)) throw new Error(`${wh} is down`);
  const d = data[wh];
  const hit = (ok) => ({ rows: ok ? [{ '?column?': 1 }] : [] });
  if (/RIGHT\(public_token::text, 6\)/.test(sql)) return hit(d.slips.some((t) => t.endsWith(params[0].toLowerCase())));
  if (/public_token = \$1::uuid/.test(sql)) return hit(d.slips.includes(params[0]));
  if (/FROM user_invites WHERE token_hash/.test(sql)) return hit(d.invites.includes(params[0]));
  if (/section_18a_form_token_hash = \$1/.test(sql)) return hit(d.forms.includes(params[0]));
  if (/FROM users u WHERE lower\(u.username\)/.test(sql)) {
    return { rows: d.users.filter((u) => u.username === String(params[0]).toLowerCase() && (!params[1] || u.id !== params[1])) };
  }
  return { rows: [] };
});

vi.mock('../src/config/db.js', () => ({
  default: {
    query: (...a) => fakeQuery(...a),
    isMultiWarehouse: true,
    warehouseCodes: ['cpt', 'gauteng', 'northern-cape'],
  },
}));

vi.mock('../src/repositories/reporting.repository.js', () => {
  const metric = (key) => vi.fn(async () => {
    const wh = currentWarehouse();
    if (down.has(wh)) throw new Error('down');
    return [{ value: data[wh].impact[key] }];
  });
  return { default: { paperSaved: metric('paper'), compostProcessed: metric('compost'), childrenReached: metric('children') } };
});

const { default: publicWarehouse } = await import('../src/middleware/publicWarehouse.middleware.js');
const { optionalGuest } = await import('../src/middleware/auth.middleware.js');
const { default: gmailService } = await import('../src/services/gmail.service.js');
const { default: publicImpactService } = await import('../src/services/publicImpact.service.js');
const { default: userRepo } = await import('../src/repositories/user.repository.js');
const { default: publicWarehousesRouter } = await import('../src/routes/publicWarehouses.route.js');
const { guestWarehouseClaim } = await import('../src/config/warehouses.js');

// Every route below just reports which warehouse it ran in.
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(publicWarehouse);
app.use('/api/public/warehouses', publicWarehousesRouter);
const report = (req, res) => res.json({ warehouse: currentWarehouse(), guest: req.guest ?? null });
app.get('/api/slip/code/:code', report);
app.post('/api/slip/code/:code/claim', optionalGuest, report);
app.get('/api/slip/:token', report);
app.post('/api/slip/:token/claim', optionalGuest, report);
app.post('/api/slip/claim/:id', report);
app.get('/api/invites/:token', report);
app.post('/api/invites/:token/accept', report);
app.post('/api/invites/:id/resend', report);
app.get('/api/donations/section-18a/form/:token', report);
app.post('/api/volunteers/sign-in', report);
app.get('/api/gmail/callback', report);
app.get('/api/other', report);

const URLS = JSON.stringify({ cpt: 'postgres://a', gauteng: 'postgres://b', 'northern-cape': 'postgres://c' });

beforeEach(() => {
  process.env.WAREHOUSE_DB_URLS = URLS;
  process.env.WAREHOUSE_NAMES = '{"cpt":"Cape Town"}';
  reset();
  down.clear();
});
afterEach(() => {
  delete process.env.WAREHOUSE_DB_URLS;
  delete process.env.WAREHOUSE_NAMES;
});

describe('public links find their own warehouse', () => {
  it.each([
    ['pallet QR (token)', 'get', `/api/slip/${SLIP_GP}`, 'gauteng'],
    ['pallet claim (token)', 'post', `/api/slip/${SLIP_CPT}/claim`, 'cpt'],
    ['pallet short code', 'get', '/api/slip/code/FEDCBA', 'gauteng'],
    ['invite link', 'get', `/api/invites/${INVITE}`, 'gauteng'],
    ['invite accept', 'post', `/api/invites/${INVITE}/accept`, 'gauteng'],
    ['donor 18A form', 'get', `/api/donations/section-18a/form/${FORM}`, 'northern-cape'],
  ])('%s', async (_label, method, path, expected) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(200);
    expect(res.body.warehouse).toBe(expected);
  });

  it('ignores a stale hint when the token is found elsewhere', async () => {
    const res = await request(app).get(`/api/slip/${SLIP_GP}`).set('X-Warehouse', 'cpt');
    expect(res.body.warehouse).toBe('gauteng');
  });

  it('404 when no warehouse has the token', async () => {
    const res = await request(app).get('/api/slip/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('409 for a short code at two sites, unless a hint picks one of them', async () => {
    data.gauteng.slips.push(SLIP_GP_SAME_CODE);
    const res = await request(app).get('/api/slip/code/0abcde');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'WAREHOUSE_REQUIRED', warehouses: ['cpt', 'gauteng'] });
    const hinted = await request(app).get('/api/slip/code/0abcde?w=gauteng');
    expect(hinted.body.warehouse).toBe('gauteng');
  });

  it('still finds a token when another site is down', async () => {
    down.add('cpt');
    const res = await request(app).get(`/api/invites/${INVITE}`);
    expect(res.body.warehouse).toBe('gauteng');
  });

  it('503 when every site is down', async () => {
    ['cpt', 'gauteng', 'northern-cape'].forEach((w) => down.add(w));
    const res = await request(app).get(`/api/invites/${INVITE}`);
    expect(res.status).toBe(503);
  });

  it('leaves staff routes alone (numeric ids, other prefixes)', async () => {
    for (const [method, path] of [['post', '/api/slip/claim/12'], ['post', '/api/invites/5/resend'], ['get', '/api/other']]) {
      const res = await request(app)[method](path);
      expect([path, res.body.warehouse]).toEqual([path, null]);
    }
    expect(fakeQuery).not.toHaveBeenCalledWith(expect.stringMatching(/claim|resend/), expect.anything());
  });

  it('does nothing in single-warehouse mode', async () => {
    delete process.env.WAREHOUSE_DB_URLS;
    fakeQuery.mockClear();
    const res = await request(app).get(`/api/slip/${SLIP_GP}`);
    expect(res.body.warehouse).toBe(null);
    expect(fakeQuery).not.toHaveBeenCalled();
  });
});

describe('volunteer sign-in', () => {
  it('uses ?w= from the poster link', async () => {
    const res = await request(app).post('/api/volunteers/sign-in?w=northern-cape').send({ name: 'x' });
    expect(res.body.warehouse).toBe('northern-cape');
  });

  it('uses the header the sign-in page sends', async () => {
    const res = await request(app).post('/api/volunteers/sign-in').set('X-Warehouse', 'gauteng').send({ name: 'x' });
    expect(res.body.warehouse).toBe('gauteng');
  });

  it('400 WAREHOUSE_REQUIRED without one', async () => {
    const res = await request(app).post('/api/volunteers/sign-in').send({ name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WAREHOUSE_REQUIRED');
  });

  it('ignores an unknown warehouse in the hint', async () => {
    const res = await request(app).post('/api/volunteers/sign-in?w=durban').send({ name: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('guest sessions', () => {
  const guestCookie = (claims) => `wms_token=${jwt.sign({ id: 7, role: 'guest', ...claims }, process.env.JWT_SECRET)}`;

  it('the claim reuses a guest session from the same warehouse', async () => {
    const res = await request(app).post(`/api/slip/${SLIP_CPT}/claim`).set('Cookie', guestCookie({ warehouse: 'cpt' }));
    expect(res.body.guest).toMatchObject({ id: 7, warehouse: 'cpt' });
  });

  it('the claim ignores a guest session from another warehouse', async () => {
    const res = await request(app).post(`/api/slip/${SLIP_CPT}/claim`).set('Cookie', guestCookie({ warehouse: 'gauteng' }));
    expect(res.body.warehouse).toBe('cpt');
    expect(res.body.guest).toBe(null);
  });

  it('new guest tokens carry the warehouse they signed in at', async () => {
    expect(guestWarehouseClaim()).toEqual({});
    await runInWarehouse('gauteng', async () => {
      expect(guestWarehouseClaim()).toEqual({ warehouse: 'gauteng' });
    });
  });
});

describe('gmail callback', () => {
  it('runs in the warehouse that started the connection', async () => {
    const { state } = await runInWarehouse('northern-cape', async () => {
      process.env.GMAIL_CLIENT_ID ||= 'id';
      process.env.GMAIL_CLIENT_SECRET ||= 'secret';
      process.env.GMAIL_REDIRECT_URI ||= 'http://localhost/api/gmail/callback';
      return gmailService.startConnectFlow({ initiatedByUserId: 1 });
    });
    expect(gmailService.warehouseForState(state)).toBe('northern-cape');
    const res = await request(app).get(`/api/gmail/callback?state=${state}`);
    expect(res.body.warehouse).toBe('northern-cape');
  });

  it('passes an unknown state straight to the route, with no warehouse', async () => {
    const res = await request(app).get('/api/gmail/callback?state=nope');
    expect(res.status).toBe(200);
    expect(res.body.warehouse).toBe(null);
  });
});

describe('GET /api/public/warehouses', () => {
  it('lists sites and names only', async () => {
    const res = await request(app).get('/api/public/warehouses');
    expect(res.body).toEqual({
      success: true,
      multiWarehouse: true,
      warehouses: [
        { code: 'cpt', name: 'Cape Town' },
        { code: 'gauteng', name: 'gauteng' },
        { code: 'northern-cape', name: 'northern-cape' },
      ],
    });
  });
});

describe('landing-page impact counters', () => {
  // The service caches for 5 minutes; move the clock past it per test.
  let clock = Date.now();
  const freshCall = () => {
    clock += 10 * 60 * 1000;
    vi.setSystemTime(clock);
    return publicImpactService.getPublicImpactSummary();
  };
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('adds every warehouse up', async () => {
    expect(await freshCall()).toEqual({ paper: 111, compost: 222, children: 333 });
  });

  it('counts a site that is down as 0 rather than failing', async () => {
    down.add('northern-cape');
    expect(await freshCall()).toEqual({ paper: 11, compost: 22, children: 33 });
  });

  it('with one database, reads that database only', async () => {
    delete process.env.WAREHOUSE_DB_URLS;
    // No warehouse context in single mode: the fake db would throw, so
    // every metric falls back to 0 — proving no per-site loop ran.
    expect(await freshCall()).toEqual({ paper: 0, compost: 0, children: 0 });
  });
});

describe('usernames are unique across warehouses', () => {
  it('finds a clash at another site and says where', async () => {
    const clash = await runInWarehouse('northern-cape', () => userRepo.findUserByUsername('lindiwe'));
    expect(clash).toMatchObject({ username: 'lindiwe', warehouse: 'gauteng' });
  });

  it('a local match wins and is not labelled', async () => {
    const clash = await runInWarehouse('cpt', () => userRepo.findUserByUsername('grizel'));
    expect(clash).toMatchObject({ id: 4 });
    expect(clash).not.toHaveProperty('warehouse');
  });

  it('excludeId applies only to this site (renaming yourself is fine)', async () => {
    const clash = await runInWarehouse('cpt', () => userRepo.findUserByUsername('grizel', { excludeId: 4 }));
    expect(clash).toBeNull();
  });

  it('no clash anywhere returns null', async () => {
    expect(await runInWarehouse('cpt', () => userRepo.findUserByUsername('nobody'))).toBeNull();
  });

  it('fails closed if another site cannot be checked', async () => {
    down.add('gauteng');
    await expect(runInWarehouse('cpt', () => userRepo.findUserByUsername('nobody'))).rejects.toThrow(/down/);
  });
});
