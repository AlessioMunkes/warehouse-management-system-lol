// ─────────────────────────────────────────────────────────────
// server/__tests__/multiWarehouseAuth.test.js
//
// Script 50: login, auth and /api/me with one database per warehouse.
// No real database: db.js is replaced by a fake whose query() answers
// from whichever warehouse is active, exactly as the real router picks
// a pool. That lets these tests prove the important thing: a request
// only ever reaches the database of a warehouse its session allows.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { currentWarehouse } from '../src/config/warehouseContext.js';

const PASSWORD = 'Pass123!';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const OTHER_HASH = bcrypt.hashSync('Different1!', 4);

const URLS = JSON.stringify({
  cpt: 'postgres://cpt',
  gauteng: 'postgres://gp',
  'northern-cape': 'postgres://nc',
});

// Users per warehouse database. Same person, different ids and roles.
let sites;
const resetSites = () => {
  sites = {
    cpt: [
      { id: 4, username: 'grizel', first_name: 'Grizel', last_name: 'M', role: 'admin', password_hash: HASH, is_active: true },
      { id: 9, username: 'thabo',  first_name: 'Thabo',  last_name: 'N', role: 'warehouse_worker', password_hash: HASH, is_active: true },
      { id: 12, username: 'gone',  first_name: 'Gone',   last_name: 'X', role: 'manager', password_hash: HASH, is_active: false },
    ],
    gauteng: [
      { id: 21, username: 'grizel', first_name: 'Grizel', last_name: 'M', role: 'warehouse_worker', password_hash: HASH, is_active: true },
      { id: 22, username: 'thabo',  first_name: 'Thabo',  last_name: 'N', role: 'manager', password_hash: OTHER_HASH, is_active: true },
    ],
    'northern-cape': [
      { id: 31, username: 'sipho', first_name: 'Sipho', last_name: 'D', role: 'admin', password_hash: HASH, is_active: true },
    ],
  };
};

const queried = []; // which warehouse each query reached
const failing = new Set(); // warehouses whose database is "down"

const fakeQuery = vi.fn(async (sql, params) => {
  const wh = currentWarehouse();
  if (!wh) throw new Error('[db] Query attempted with no active warehouse.');
  queried.push(wh);
  if (failing.has(wh)) throw new Error(`database ${wh} is down`);
  const rows = sites[wh];
  if (/LOWER\(username\)/.test(sql)) {
    return { rows: rows.filter((u) => u.username.toLowerCase() === String(params[0]).toLowerCase()) };
  }
  if (/WHERE id = \$1/.test(sql)) {
    return { rows: rows.filter((u) => u.id === params[0]) };
  }
  return { rows: [] };
});

vi.mock('../src/config/db.js', () => ({
  default: {
    query: (...a) => fakeQuery(...a),
    get isMultiWarehouse() { return true; },
    get warehouseCodes() { return ['cpt', 'gauteng', 'northern-cape']; },
  },
}));

// Built once and shared. No vi.resetModules(): the routes and this
// file must share ONE warehouseContext module, or the fake database
// would read a different AsyncLocalStorage than the routes write.
let appPromise;
const buildApp = () => (appPromise ||= makeApp());
const makeApp = async () => {
  const { default: loginRouter } = await import('../src/routes/login.route.js');
  const { default: sessionRouter } = await import('../src/routes/session.route.js');
  const { default: auth, requireRole } = await import('../src/middleware/auth.middleware.js');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/login', loginRouter);
  app.use('/api/me', sessionRouter);
  // A probe route: reports which warehouse and user the handler sees.
  app.get('/api/probe', auth, (req, res) =>
    res.json({ warehouse: currentWarehouse(), id: req.user.id, role: req.user.role }));
  app.get('/api/admin-only', auth, requireRole('admin'), (req, res) => res.json({ ok: true }));
  return app;
};

const cookieFrom = (res) => res.headers['set-cookie'].find((c) => c.startsWith('wms_token=')).split(';')[0];
const login = async (app, username, password = PASSWORD) =>
  request(app).post('/api/login').send({ username, password });
const tokenCookie = (claims, secret = process.env.JWT_SECRET) => `wms_token=${jwt.sign(claims, secret)}`;

beforeEach(() => {
  process.env.WAREHOUSE_DB_URLS = URLS;
  process.env.WAREHOUSE_NAMES = JSON.stringify({ cpt: 'Cape Town', gauteng: 'Gauteng' });
  resetSites();
  queried.length = 0;
  failing.clear();
  fakeQuery.mockClear();
});

afterEach(() => {
  delete process.env.WAREHOUSE_DB_URLS;
  delete process.env.WAREHOUSE_NAMES;
});

describe('multi-warehouse login', () => {
  it('grants every site where the password matches, with that site\'s id and role', async () => {
    const app = await buildApp();
    const res = await login(app, 'grizel');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 4, role: 'admin', warehouse: 'cpt' });
    expect(res.body.user.warehouses).toEqual([
      { code: 'cpt', name: 'Cape Town', role: 'admin' },
      { code: 'gauteng', name: 'Gauteng', role: 'warehouse_worker' },
    ]);
    const claims = jwt.decode(cookieFrom(res).slice('wms_token='.length));
    expect(claims.warehouses).toEqual({
      cpt: { id: 4, role: 'admin' },
      gauteng: { id: 21, role: 'warehouse_worker' },
    });
    expect(claims).not.toHaveProperty('role');
  });

  it('looks in every warehouse', async () => {
    const app = await buildApp();
    await login(app, 'grizel');
    expect(new Set(queried)).toEqual(new Set(['cpt', 'gauteng', 'northern-cape']));
  });

  it('only grants sites whose password was typed', async () => {
    const app = await buildApp();
    const res = await login(app, 'thabo'); // CPT password; Gauteng's differs
    expect(res.status).toBe(200);
    expect(res.body.user.warehouses.map((w) => w.code)).toEqual(['cpt']);
  });

  it('shows a code as the name when no name is configured', async () => {
    const app = await buildApp();
    const res = await login(app, 'sipho');
    expect(res.body.user.warehouses).toEqual([{ code: 'northern-cape', name: 'northern-cape', role: 'admin' }]);
  });

  it('401 for a wrong password or unknown user, with the same message', async () => {
    const app = await buildApp();
    const a = await login(app, 'grizel', 'wrong');
    const b = await login(app, 'nobody');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('403 when the only matching account is deactivated', async () => {
    const app = await buildApp();
    const res = await login(app, 'gone');
    expect(res.status).toBe(403);
  });

  it('leaves out a deactivated site but keeps active ones', async () => {
    sites.gauteng[0].is_active = false;
    const app = await buildApp();
    const res = await login(app, 'grizel');
    expect(res.body.user.warehouses.map((w) => w.code)).toEqual(['cpt']);
  });

  it('still logs people in when one warehouse database is down', async () => {
    failing.add('gauteng');
    const app = await buildApp();
    const res = await login(app, 'grizel');
    expect(res.status).toBe(200);
    expect(res.body.user.warehouses.map((w) => w.code)).toEqual(['cpt']);
  });

  it('500 when every warehouse database is down', async () => {
    ['cpt', 'gauteng', 'northern-cape'].forEach((w) => failing.add(w));
    const app = await buildApp();
    const res = await login(app, 'grizel');
    expect(res.status).toBe(500);
  });
});

describe('multi-warehouse auth', () => {
  it('runs the request inside the chosen warehouse with that site\'s id and role', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    const cpt = await request(app).get('/api/probe').set('Cookie', cookie).set('X-Warehouse', 'cpt');
    const gp = await request(app).get('/api/probe').set('Cookie', cookie).set('X-Warehouse', 'gauteng');
    expect(cpt.body).toEqual({ warehouse: 'cpt', id: 4, role: 'admin' });
    expect(gp.body).toEqual({ warehouse: 'gauteng', id: 21, role: 'warehouse_worker' });
  });

  it('applies requireRole to the role at the chosen site', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    const cpt = await request(app).get('/api/admin-only').set('Cookie', cookie).set('X-Warehouse', 'cpt');
    const gp = await request(app).get('/api/admin-only').set('Cookie', cookie).set('X-Warehouse', 'gauteng');
    expect(cpt.status).toBe(200);
    expect(gp.status).toBe(403);
  });

  it('400 WAREHOUSE_REQUIRED when a multi-site user sends no header', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    const res = await request(app).get('/api/probe').set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'WAREHOUSE_REQUIRED', warehouses: ['cpt', 'gauteng'] });
  });

  it('uses the only site automatically for a single-site user', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'sipho'));
    const res = await request(app).get('/api/probe').set('Cookie', cookie);
    expect(res.body).toEqual({ warehouse: 'northern-cape', id: 31, role: 'admin' });
  });

  it('403 for a warehouse the session does not include', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    const res = await request(app).get('/api/probe').set('Cookie', cookie).set('X-Warehouse', 'northern-cape');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WAREHOUSE_FORBIDDEN');
  });

  it('400 for a malformed header, and never reaches a database', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    queried.length = 0;
    const res = await request(app).get('/api/probe').set('Cookie', cookie).set('X-Warehouse', '../etc');
    expect(res.status).toBe(400);
    expect(queried).toEqual([]);
  });

  it('treats the header case-insensitively', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    const res = await request(app).get('/api/probe').set('Cookie', cookie).set('X-Warehouse', ' CPT ');
    expect(res.body.warehouse).toBe('cpt');
  });

  it('drops a site that is no longer configured, even from a valid token', async () => {
    const app = await buildApp();
    const cookie = tokenCookie({ username: 'g', warehouses: { cpt: { id: 4, role: 'admin' }, durban: { id: 1, role: 'admin' } } });
    const res = await request(app).get('/api/probe').set('Cookie', cookie).set('X-Warehouse', 'durban');
    expect(res.status).toBe(403);
    const auto = await request(app).get('/api/probe').set('Cookie', cookie);
    expect(auto.body.warehouse).toBe('cpt'); // durban dropped, so cpt is the only site
  });

  it('401 for a token from single-warehouse mode (no warehouses claim)', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/probe')
      .set('Cookie', tokenCookie({ id: 4, username: 'grizel', role: 'admin' })).set('X-Warehouse', 'cpt');
    expect(res.status).toBe(401);
  });

  it('401 for a token signed with another secret', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/probe')
      .set('Cookie', tokenCookie({ username: 'x', warehouses: { cpt: { id: 1, role: 'admin' } } }, 'attacker'))
      .set('X-Warehouse', 'cpt');
    expect(res.status).toBe(401);
  });

  it('ignores a warehouses claim whose entries are malformed', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/probe')
      .set('Cookie', tokenCookie({ username: 'x', warehouses: { cpt: { id: '4', role: 'admin' } } }))
      .set('X-Warehouse', 'cpt');
    expect(res.status).toBe(403);
  });

  describe('guests', () => {
    it('runs in the warehouse named in the token', async () => {
      const app = await buildApp();
      const cookie = tokenCookie({ id: 7, role: 'guest', warehouse: 'gauteng' });
      const res = await request(app).get('/api/probe').set('Cookie', cookie);
      expect(res.body).toEqual({ warehouse: 'gauteng', id: 7, role: 'guest' });
    });

    it('403 when a guest asks for another warehouse', async () => {
      const app = await buildApp();
      const cookie = tokenCookie({ id: 7, role: 'guest', warehouse: 'gauteng' });
      const res = await request(app).get('/api/probe').set('Cookie', cookie).set('X-Warehouse', 'cpt');
      expect(res.status).toBe(403);
    });

    it('401 for a guest token with no warehouse', async () => {
      const app = await buildApp();
      const res = await request(app).get('/api/probe').set('Cookie', tokenCookie({ id: 7, role: 'guest' }));
      expect(res.status).toBe(401);
    });
  });
});

describe('/api/me in multi-warehouse mode', () => {
  it('GET /warehouses lists the session\'s sites without needing a warehouse', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    queried.length = 0;
    const res = await request(app).get('/api/me/warehouses').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      multiWarehouse: true,
      warehouses: [
        { code: 'cpt', name: 'Cape Town', role: 'admin' },
        { code: 'gauteng', name: 'Gauteng', role: 'warehouse_worker' },
      ],
    });
    expect(queried).toEqual([]); // reads the token only
  });

  it('GET /warehouses 401 without a session', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/me/warehouses');
    expect(res.status).toBe(401);
  });

  it('GET / re-reads the user from the chosen warehouse and names it', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    const res = await request(app).get('/api/me').set('Cookie', cookie).set('X-Warehouse', 'gauteng');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 21, role: 'warehouse_worker', warehouse: 'gauteng' });
    expect(res.body.user.warehouses).toEqual([
      { code: 'cpt', name: 'Cape Town' },
      { code: 'gauteng', name: 'Gauteng' },
    ]);
  });

  it('GET / rejects the session if the account was deactivated at that site since login', async () => {
    const app = await buildApp();
    const cookie = cookieFrom(await login(app, 'grizel'));
    sites.gauteng[0].is_active = false;
    const res = await request(app).get('/api/me').set('Cookie', cookie).set('X-Warehouse', 'gauteng');
    expect(res.status).toBe(401);
  });
});
