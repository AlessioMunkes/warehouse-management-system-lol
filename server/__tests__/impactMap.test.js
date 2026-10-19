// ─────────────────────────────────────────────────────────────
// server/__tests__/impactMap.test.js
//
// The Impact map and Centre locations: the period's South African day
// boundaries (features/impactMap/impactRange.js), the query that adds
// up each centre (dates passed inclusive, the reports' own collection
// day and statuses), meals from the reports' factor, the cache, the
// pin rules, and who may call what. The database is mocked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const poolMock = { query: vi.fn(), connect: vi.fn(), on: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const today = { value: '2026-10-19' };
vi.mock('../src/repositories/shelfLots.repository.js', () => ({
  todayInSAST: () => today.value,
  loadShelfLots: vi.fn(async () => new Map()),
}));

const { resolveRange, calendarDay, daysInclusive } = await import('../src/features/impactMap/impactRange.js');
const { default: impactModel } = await import('../src/repositories/impactMap.repository.js');
const { default: impactService } = await import('../src/services/impactMap.service.js');
const { default: locationService } = await import('../src/services/centreLocation.service.js');
const { LEFT_DAY } = await import('../src/repositories/reporting.repository.js');
const { default: impactRouter } = await import('../src/routes/impactMap.routes.js');
const { default: locationRouter } = await import('../src/routes/centreLocation.routes.js');

const centreRow = (extra = {}) => ({
  id: 1, name: 'Alfa Educare', cohort: 'tuesday', child_count: 35, is_active: true,
  suburb: 'Delft', latitude: '-33.970000', longitude: '18.640000',
  dispatches: 4, kg: '40.25', last_collected: '2026-10-14', ...extra,
});

// The impact query, then the meals factor.
const answer = ({ rows = [centreRow()], factor = { value: '2.5', unit: 'meals/kg', source_note: 'NGO norm' } } = {}) => {
  poolMock.query.mockImplementation(async (sql) => {
    if (sql.includes('reporting_factors')) return { rows: factor ? [factor] : [] };
    return { rows };
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  today.value = '2026-10-19';
  impactService.clearImpactCache();
  answer();
});

describe('the period', () => {
  it('defaults to the last 90 days, today included', () => {
    const r = resolveRange({}, '2026-10-19');
    expect(r).toEqual({ from: '2026-07-22', to: '2026-10-19' });
    expect(daysInclusive(r.from, r.to)).toBe(90);
  });

  it('counts back from an end date alone, and runs a start date alone to today', () => {
    expect(resolveRange({ to: '2026-03-31' }, '2026-10-19')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(resolveRange({ from: '2026-10-01' }, '2026-10-19')).toEqual({ from: '2026-10-01', to: '2026-10-19' });
  });

  it('crosses month and leap-year ends by calendar day', () => {
    expect(resolveRange({ to: '2028-03-01' }, '2028-03-01').from).toBe('2027-12-03');
    expect(daysInclusive('2028-02-28', '2028-03-01')).toBe(3);
  });

  it('takes a one-day period', () => {
    expect(resolveRange({ from: '2026-10-19', to: '2026-10-19' }, '2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-19' });
  });

  it.each([
    ['a day that does not exist', { from: '2026-02-30' }, /start date/],
    ['a timestamp', { to: '2026-10-19T00:00:00Z' }, /end date/],
    ['a start after the end', { from: '2026-10-20', to: '2026-10-19' }, /after the end/],
    ['more than two years', { from: '2020-01-01', to: '2026-10-19' }, /730 days/],
  ])('refuses %s', (_label, query, message) => {
    expect(resolveRange(query, '2026-10-19').error).toMatch(message);
  });

  it('knows a real calendar day', () => {
    expect(calendarDay('2028-02-29')).toBe('2028-02-29');
    expect(calendarDay('2027-02-29')).toBeNull();
  });
});

describe('the query', () => {
  it('passes the period as inclusive SAST days and uses the reports\' rules', async () => {
    await impactModel.listCentreImpact({ from: '2026-07-22', to: '2026-10-19' });
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toContain(`${LEFT_DAY} BETWEEN $1::date AND $2::date`);
    expect(LEFT_DAY).toContain("AT TIME ZONE 'Africa/Johannesburg'");
    expect(sql).toContain("FILTER (WHERE del.unit = 'kg')");
    expect(params).toEqual(['2026-07-22', '2026-10-19', ['collected', 'late_collected'], ['ecd', 'soup_kitchen']]);
  });

  it('works out the default period from today in South Africa', async () => {
    today.value = '2026-01-01';
    const map = await impactService.getImpactMap({});
    expect(map.range).toEqual({ from: '2025-10-04', to: '2026-01-01', today: '2026-01-01' });
    expect(poolMock.query.mock.calls[0][1].slice(0, 2)).toEqual(['2025-10-04', '2026-01-01']);
  });
});

describe('getImpactMap', () => {
  it('gives each centre its pin, dispatches, kilograms and meals from the factor', async () => {
    const map = await impactService.getImpactMap({});
    expect(map.factor).toEqual({ value: 2.5, note: 'NGO norm' });
    expect(map.centres[0]).toEqual({
      id: 1, name: 'Alfa Educare', cohort: 'tuesday', childCount: 35, isActive: true, suburb: 'Delft',
      lat: -33.97, lng: 18.64, dispatches: 4, kg: 40.25, meals: 101, lastCollected: '2026-10-14',
    });
  });

  it('still answers with kilograms when no meals factor is set', async () => {
    answer({ factor: null });
    const map = await impactService.getImpactMap({});
    expect(map.factor).toBeNull();
    expect(map.centres[0]).toMatchObject({ kg: 40.25, meals: null });
  });

  it('refuses a bad period before querying', async () => {
    await expect(impactService.getImpactMap({ from: 'yesterday' })).rejects.toMatchObject({ status: 400 });
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('keeps an answer for a minute, and drops it when a centre is moved', async () => {
    await impactService.getImpactMap({});
    await impactService.getImpactMap({});
    expect(poolMock.query).toHaveBeenCalledTimes(2); // the query and the factor, once
    impactService.forgetImpactMap();
    await impactService.getImpactMap({});
    expect(poolMock.query).toHaveBeenCalledTimes(4);
  });
});

describe('setLocation', () => {
  const stored = { id: 1, name: 'Alfa Educare', cohort: 'tuesday', is_active: true, latitude: null, longitude: null, location_source: null };

  beforeEach(() => {
    poolMock.query.mockImplementation(async (sql) => (sql.startsWith('UPDATE') ? { rowCount: 1 } : { rows: [stored] }));
  });

  it('saves an address and a pin placed by hand', async () => {
    await locationService.setLocation(1, { address: ' 12 Main Rd ', suburb: 'Delft', lat: -33.9701234567, lng: 18.64 }, 7);
    const update = poolMock.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'));
    expect(update[1]).toEqual([1, '12 Main Rd', 'Delft', -33.970123, 18.64, 'manual', null, 7]);
  });

  it('refuses half a pin and a pin outside South Africa', async () => {
    await expect(locationService.setLocation(1, { lat: -33.9 }, 7)).rejects.toMatchObject({ status: 400 });
    await expect(locationService.setLocation(1, { lat: 51.5, lng: -0.1 }, 7)).rejects.toMatchObject({ status: 400 });
  });

  it('clears a pin and its source together', async () => {
    await locationService.setLocation(1, { address: '', suburb: 'Delft', lat: null, lng: null }, 7);
    const update = poolMock.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'));
    expect(update[1]).toEqual([1, null, 'Delft', null, null, null, null, 7]);
  });

  it('says when the centre does not exist', async () => {
    poolMock.query.mockImplementation(async () => ({ rows: [] }));
    await expect(locationService.setLocation(99, {}, 7)).rejects.toMatchObject({ status: 404 });
  });
});

describe('routes', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/impact-map', impactRouter);
  app.use('/api/centre-locations', locationRouter);
  const cookieFor = (role) => [`wms_token=${jwt.sign({ id: 5, username: 'u', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`];

  it('lets a manager read the map but not set locations', async () => {
    expect((await request(app).get('/api/impact-map').set('Cookie', cookieFor(ROLES.MANAGER))).status).toBe(200);
    expect((await request(app).get('/api/centre-locations').set('Cookie', cookieFor(ROLES.MANAGER))).status).toBe(403);
    expect((await request(app).patch('/api/centre-locations/1').set('Cookie', cookieFor(ROLES.MANAGER)).send({})).status).toBe(403);
  });

  it('turns the floor away from both', async () => {
    expect((await request(app).get('/api/impact-map').set('Cookie', cookieFor(ROLES.WORKER))).status).toBe(403);
    expect((await request(app).get('/api/centre-locations').set('Cookie', cookieFor(ROLES.WORKER))).status).toBe(403);
  });

  it('answers a bad period with its reason', async () => {
    const res = await request(app).get('/api/impact-map?from=2026-13-01').set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/start date/);
  });
});
