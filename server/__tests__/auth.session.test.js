// ─────────────────────────────────────────────────────────────
// server/__tests__/auth.session.test.js
//
// A token is only as good as the account behind it right now. These
// pin what auth.middleware.js refuses even though the token itself is
// signed and unexpired: a deactivated or archived account, a password
// changed since the token was issued, a demoted role, a guest whose
// visit is signed out. And that a database blip refuses with a 503
// without logging anyone out.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express      from 'express';
import cookieParser from 'cookie-parser';
import request      from 'supertest';
import jwt          from 'jsonwebtoken';

const sessionRepo = { findStaffSession: vi.fn(), findGuestSession: vi.fn() };
vi.mock('../src/repositories/session.repository.js', () => ({ default: sessionRepo }));

const changePassword = vi.fn();
vi.mock('../src/services/account.service.js', () => ({
  default: { changePassword: (...a) => changePassword(...a), changeEmail: vi.fn() },
}));

const { default: auth, requireRole, ROLES } = await import('../src/middleware/auth.middleware.js');
const { default: sessionRouter } = await import('../src/routes/session.route.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.get('/admin-only', auth, requireRole(ROLES.ADMIN), (req, res) => res.json({ role: req.user.role }));
app.get('/any', auth, (req, res) => res.json({ role: req.user.role }));
app.use('/api/me', sessionRouter);

const cookieFor = (claims) => [`wms_token=${jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '1h' })}`];
const ADMIN = { id: 4, username: 'ADMIN', role: ROLES.ADMIN };
const account = (over = {}) => ({
  id: 4, username: 'ADMIN', role: ROLES.ADMIN, is_active: true, archived_at: null, session_version: 0, ...over,
});
const clearsCookie = (res) =>
  (res.headers['set-cookie'] ?? []).some((c) => c.startsWith('wms_token=;'));

beforeEach(() => {
  vi.clearAllMocks();
  sessionRepo.findStaffSession.mockResolvedValue(account());
  sessionRepo.findGuestSession.mockResolvedValue({ id: 9, signed_out_at: null });
});

describe('staff tokens', () => {
  it('lets a current account through', async () => {
    const res = await request(app).get('/admin-only').set('Cookie', cookieFor(ADMIN));
    expect(res.status).toBe(200);
    expect(sessionRepo.findStaffSession).toHaveBeenCalledWith(4);
  });

  it('refuses a deactivated account and clears the cookie', async () => {
    sessionRepo.findStaffSession.mockResolvedValue(account({ is_active: false }));
    const res = await request(app).get('/any').set('Cookie', cookieFor(ADMIN));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('This account has been deactivated.');
    expect(clearsCookie(res)).toBe(true);
  });

  it('refuses an archived or deleted account', async () => {
    sessionRepo.findStaffSession.mockResolvedValue(account({ archived_at: new Date() }));
    expect((await request(app).get('/any').set('Cookie', cookieFor(ADMIN))).status).toBe(401);

    sessionRepo.findStaffSession.mockResolvedValue(null);
    expect((await request(app).get('/any').set('Cookie', cookieFor(ADMIN))).status).toBe(401);
  });

  it('refuses a token from before the password changed', async () => {
    sessionRepo.findStaffSession.mockResolvedValue(account({ session_version: 1 }));
    const old = await request(app).get('/any').set('Cookie', cookieFor(ADMIN));
    expect(old.status).toBe(401);
    expect(old.body.message).toMatch(/log in again/);

    const fresh = await request(app).get('/any').set('Cookie', cookieFor({ ...ADMIN, sv: 1 }));
    expect(fresh.status).toBe(200);
  });

  it('uses the role the account has now, not the one in the token', async () => {
    sessionRepo.findStaffSession.mockResolvedValue(account({ role: ROLES.WORKER }));
    const res = await request(app).get('/admin-only').set('Cookie', cookieFor(ADMIN));
    expect(res.status).toBe(403);
  });

  it('answers 503 and keeps the cookie when the database is down', async () => {
    sessionRepo.findStaffSession.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/any').set('Cookie', cookieFor(ADMIN));
    expect(res.status).toBe(503);
    expect(clearsCookie(res)).toBe(false);
  });
});

describe('guest tokens', () => {
  const GUEST = { id: 9, role: ROLES.GUEST };

  it('lets an open visit through, without reading users', async () => {
    const res = await request(app).get('/any').set('Cookie', cookieFor(GUEST));
    expect(res.status).toBe(200);
    expect(sessionRepo.findGuestSession).toHaveBeenCalledWith(9);
    expect(sessionRepo.findStaffSession).not.toHaveBeenCalled();
  });

  it('refuses a copied token once the visit is signed out', async () => {
    sessionRepo.findGuestSession.mockResolvedValue({ id: 9, signed_out_at: new Date() });
    const res = await request(app).get('/any').set('Cookie', cookieFor(GUEST));
    expect(res.status).toBe(401);
    expect(clearsCookie(res)).toBe(true);
  });
});

describe('changing your own password', () => {
  it('ends other sessions but signs this one again with the new version', async () => {
    changePassword.mockImplementation(async () => {
      sessionRepo.findStaffSession.mockResolvedValue(account({ session_version: 1 }));
      return { changed: true };
    });

    const res = await request(app).patch('/api/me/password').set('Cookie', cookieFor(ADMIN))
      .send({ currentPassword: 'old-password', newPassword: 'new-password' });
    expect(res.status).toBe(200);

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('wms_token=') && !c.startsWith('wms_token=;'));
    const claims = jwt.decode(cookie.split(';')[0].slice('wms_token='.length));
    expect(claims).toMatchObject({ id: 4, role: ROLES.ADMIN, sv: 1 });

    // The old token is now refused; the new one works.
    expect((await request(app).get('/any').set('Cookie', cookieFor(ADMIN))).status).toBe(401);
    expect((await request(app).get('/any').set('Cookie', [cookie.split(';')[0]])).status).toBe(200);
  });
});

describe('what ends a session', () => {
  it('every password write and every deactivation raises the session version', async () => {
    const fs = await import('node:fs');
    const read = (f) => fs.readFileSync(new URL(`../src/repositories/${f}`, import.meta.url), 'utf8');
    expect(read('account.repository.js')).toMatch(/SET password_hash = \$2, session_version = session_version \+ 1/);
    expect(read('passwordReset.repository.js')).toMatch(/SET password_hash = \$2, session_version = session_version \+ 1/);
    const users = read('user.repository.js');
    expect(users).toMatch(/is_active\s+= false,\s+session_version = session_version \+ 1/);
    expect(users).toMatch(/session_version = session_version \+ CASE WHEN \$2 THEN 0 ELSE 1 END/);
  });
});
