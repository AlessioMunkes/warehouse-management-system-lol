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
