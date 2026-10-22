// ─────────────────────────────────────────────────────────────
// server/__tests__/gateCode.test.js
//
// Guest sign-in needs the day's gate code, so a name typed from
// anywhere on the internet no longer opens a packing session.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';

const volunteerRepo = {
  createGuestVisit: vi.fn(), listGuestLog: vi.fn(), signOutVolunteer: vi.fn(),
  getVolunteerById: vi.fn(), getGuestSession: vi.fn(),
};
vi.mock('../src/repositories/volunteer.repository.js', () => ({ default: volunteerRepo }));

const gate = await import('../src/services/gateCode.service.js');
const { buildVolunteerApp } = await import('./helpers/volunteerApp.js');
const app = buildVolunteerApp();

const cookieFor = (role) => [`wms_token=${jwt.sign({ id: 1, username: 'u', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`];

beforeEach(() => {
  vi.clearAllMocks();
  volunteerRepo.createGuestVisit.mockResolvedValue({ id: 12, full_name: 'Thandi' });
});

describe('the gate code', () => {
  it('is six digits, the same all day, and different the next day and at another site', () => {
    const morning = new Date('2026-10-22T06:00:00+02:00');
    const evening = new Date('2026-10-22T23:30:00+02:00');
    const nextDay = new Date('2026-10-23T00:30:00+02:00');
    expect(gate.gateCodeFor('2026-10-22')).toMatch(/^\d{6}$/);
    expect(gate.gateCodeDate(morning)).toBe('2026-10-22');
    expect(gate.gateCodeDate(evening)).toBe('2026-10-22');
    expect(gate.gateCodeDate(nextDay)).toBe('2026-10-23');
    expect(gate.gateCodeFor('2026-10-22')).not.toBe(gate.gateCodeFor('2026-10-23'));
    expect(gate.gateCodeFor('2026-10-22', 'cpt')).not.toBe(gate.gateCodeFor('2026-10-22', 'gauteng'));
  });

  it('accepts today\'s code as it reads off a sign, and nothing else', () => {
    const { code } = gate.todayGateCode();
    expect(gate.isTodayGateCode(code)).toBe(true);
    expect(gate.isTodayGateCode(`${code.slice(0, 3)} ${code.slice(3)}`)).toBe(true);
    expect(gate.isTodayGateCode(String((Number(code) + 1) % 1e6).padStart(6, '0'))).toBe(false);
    expect(gate.isTodayGateCode('')).toBe(false);
    expect(gate.isTodayGateCode(undefined)).toBe(false);
    expect(gate.isTodayGateCode('12345a')).toBe(false);
  });
});

describe('POST /api/volunteers/sign-in', () => {
  it('turns away a name with no gate code, or the wrong one, without recording a visit', async () => {
    const none = await request(app).post('/api/volunteers/sign-in').send({ name: 'Thandi' });
    expect(none.status).toBe(403);
    expect(none.body.code).toBe('GATE_CODE');

    const wrong = await request(app).post('/api/volunteers/sign-in').send({ name: 'Thandi', gateCode: '000000' === gate.todayGateCode().code ? '111111' : '000000' });
    expect(wrong.status).toBe(403);
    expect(volunteerRepo.createGuestVisit).not.toHaveBeenCalled();
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('signs a guest in with today\'s code', async () => {
    const res = await request(app).post('/api/volunteers/sign-in').send({ name: 'Thandi', gateCode: gate.todayGateCode().code });
    expect(res.status).toBe(201);
    expect(volunteerRepo.createGuestVisit).toHaveBeenCalledWith('Thandi');
    expect(res.headers['set-cookie'].some((c) => c.startsWith('wms_token='))).toBe(true);
  });
});

describe('GET /api/volunteers/gate-code', () => {
  it('gives managers and admins today\'s code', async () => {
    for (const role of ['manager', 'admin']) {
      const res = await request(app).get('/api/volunteers/gate-code').set('Cookie', cookieFor(role));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(gate.todayGateCode());
    }
  });

  it('is not for workers, guests or anyone signed out', async () => {
    expect((await request(app).get('/api/volunteers/gate-code')).status).toBe(401);
    expect((await request(app).get('/api/volunteers/gate-code').set('Cookie', cookieFor('warehouse_worker'))).status).toBe(403);
    expect((await request(app).get('/api/volunteers/gate-code').set('Cookie', cookieFor('guest'))).status).toBe(403);
  });
});
