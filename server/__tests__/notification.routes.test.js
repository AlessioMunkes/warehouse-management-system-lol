// ─────────────────────────────────────────────────────────────
// server/__tests__/notification.routes.test.js
//
// notification.service.js is mocked, so this exercises the auth /
// requireRole / validateIntId chain in notification.routes.js plus
// notification.controller.js's response shaping.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  listNotifications: vi.fn(),
  getUnreadCount:    vi.fn(),
  markRead:          vi.fn(),
  markAllRead:       vi.fn(),
  listFloorNotifications: vi.fn(),
  getFloorUnreadCount:    vi.fn(),
  markAllFloorRead:       vi.fn(),
};

vi.mock('../src/services/notification.service.js', () => ({ default: serviceMock }));

const { buildNotificationApp } = await import('./helpers/notificationApp.js');
const app  = buildNotificationApp();
const BASE = '/api/notifications';

const cookieFor = (role) => {
  const token = jwt.sign(
    { id: 1, username: 'test.manager', role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const READ_ROLES     = [ROLES.MANAGER, ROLES.ADMIN];
const NON_READ_ROLES = [ROLES.WORKER, 'finance', ROLES.GUEST];

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.listNotifications.mockResolvedValue([{ id: 1, title: 'Test' }]);
  serviceMock.getUnreadCount.mockResolvedValue(3);
  serviceMock.listFloorNotifications.mockResolvedValue([{ id: 2, title: 'Floor test' }]);
  serviceMock.getFloorUnreadCount.mockResolvedValue(1);
});

describe('notification routes — authentication', () => {
  const endpoints = [
    ['get',   BASE],
    ['get',   `${BASE}/unread-count`],
    ['post',  `${BASE}/read-all`],
    ['patch', `${BASE}/1/read`],
  ];

  it.each(endpoints)('%s %s returns 401 with no cookie', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });
});

describe('notification routes — authorisation', () => {
  it.each(READ_ROLES)('%s can list notifications', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(NON_READ_ROLES)('%s cannot list notifications', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
  });
});

describe('notification routes — parameter validation', () => {
  it.each(['abc', '0', '-1'])('rejects id "%s" with a 400', async (id) => {
    const res = await request(app).patch(`${BASE}/${id}/read`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(400);
    expect(serviceMock.markRead).not.toHaveBeenCalled();
  });
});

describe('notification routes — /floor is open to any authenticated staff member', () => {
  const floorEndpoints = [
    ['get',   `${BASE}/floor`],
    ['get',   `${BASE}/floor/unread-count`],
    ['post',  `${BASE}/floor/read-all`],
    ['patch', `${BASE}/floor/1/read`],
  ];

  it.each(floorEndpoints)('%s %s returns 401 with no cookie', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each([ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN])('%s can read the floor feed', async (role) => {
    const res = await request(app).get(`${BASE}/floor`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 2, title: 'Floor test' }] });
  });

  it('a worker can read the floor unread count', async () => {
    const res = await request(app).get(`${BASE}/floor/unread-count`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { count: 1 } });
  });

  it('a worker can mark all floor notifications read', async () => {
    const res = await request(app).post(`${BASE}/floor/read-all`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(200);
    expect(serviceMock.markAllFloorRead).toHaveBeenCalled();
  });

  it('a worker can mark one floor notification read, reusing the shared markRead', async () => {
    const res = await request(app).patch(`${BASE}/floor/1/read`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(200);
    expect(serviceMock.markRead).toHaveBeenCalled();
  });

  it('rejects an invalid id on /floor/:id/read the same as the manager route', async () => {
    const res = await request(app).patch(`${BASE}/floor/abc/read`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(400);
  });
});

describe('notification controller — responses', () => {
  it('wraps the list in the { success, data } envelope', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.body).toEqual({ success: true, data: [{ id: 1, title: 'Test' }] });
  });

  it('wraps the unread count in { count }', async () => {
    const res = await request(app).get(`${BASE}/unread-count`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.body).toEqual({ success: true, data: { count: 3 } });
  });

  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.listNotifications.mockRejectedValue(new Error('relation "notifications" does not exist'));
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });
});
