// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.dismissal.routes.test.js
//
// The dismissal endpoints: managers and admins only, ids checked, the
// signed-in user passed on and nobody else's, errors carrying their
// status. The services are mocked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const dismissalMock = { dismiss: vi.fn(), restore: vi.fn() };
vi.mock('../src/services/expiryDismissal.service.js', () => ({ default: dismissalMock }));
vi.mock('../src/services/stock.service.js', () => ({ default: {} }));

const { buildStockApp } = await import('./helpers/stockApp.js');
const app = buildStockApp();
const URL = '/api/stock/5/batches/8/dismissal';

const cookieFor = (role, id = 20) => [`wms_token=${jwt.sign({ id, username: 'test.user', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`];
const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  dismissalMock.dismiss.mockResolvedValue({ id: 1, delivery_note_item_id: 8 });
  dismissalMock.restore.mockResolvedValue({ id: 1, delivery_note_item_id: 8 });
});

describe('dismissal routes — who can use them', () => {
  it.each([['post'], ['delete']])('%s needs a signed-in user', async (verb) => {
    const res = await request(app)[verb](URL).send({ reason: 'x' });
    expect(res.status).toBe(401);
  });

  it.each([['post'], ['delete']])('%s turns a warehouse worker away', async (verb) => {
    const res = await request(app)[verb](URL).set('Cookie', cookieFor(ROLES.WORKER)).send({ reason: 'x' });
    expect(res.status).toBe(403);
    expect(dismissalMock.dismiss).not.toHaveBeenCalled();
    expect(dismissalMock.restore).not.toHaveBeenCalled();
  });

  it.each([[ROLES.MANAGER], [ROLES.ADMIN]])('lets a %s dismiss and restore', async (role) => {
    const dismissed = await request(app).post(URL).set('Cookie', cookieFor(role)).send({ reason: 'Checked the shelf' });
    const restored = await request(app).delete(URL).set('Cookie', cookieFor(role));
    expect(dismissed.status).toBe(201);
    expect(restored.status).toBe(200);
  });

  it('refuses a bad product or delivery id before it reaches the service', async () => {
    const cookie = cookieFor(ROLES.MANAGER);
    expect((await request(app).post('/api/stock/abc/batches/8/dismissal').set('Cookie', cookie).send({ reason: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/stock/5/batches/0/dismissal').set('Cookie', cookie).send({ reason: 'x' })).status).toBe(400);
    expect(dismissalMock.dismiss).not.toHaveBeenCalled();
  });
});

describe('dismissal routes — what they pass on', () => {
  it('sends the reason from the body and the user from the token', async () => {
    await request(app).post(URL).set('Cookie', cookieFor(ROLES.MANAGER, 31)).send({ reason: 'Checked the shelf', userId: 99 });

    expect(dismissalMock.dismiss).toHaveBeenCalledWith({ productId: 5, lineId: 8, reason: 'Checked the shelf' }, 31);
  });

  it('restores with the user from the token', async () => {
    await request(app).delete(URL).set('Cookie', cookieFor(ROLES.MANAGER, 31));

    expect(dismissalMock.restore).toHaveBeenCalledWith({ productId: 5, lineId: 8 }, 31);
  });

  it('keeps the service\'s message and status on a refusal, and hides a server error', async () => {
    dismissalMock.dismiss.mockRejectedValueOnce(withStatus(400, 'Say why the warning is being dismissed.'));
    const refused = await request(app).post(URL).set('Cookie', cookieFor(ROLES.MANAGER)).send({});
    expect(refused.status).toBe(400);
    expect(refused.body).toEqual({ success: false, message: 'Say why the warning is being dismissed.' });

    dismissalMock.restore.mockRejectedValueOnce(new Error('connection lost'));
    const broken = await request(app).delete(URL).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(broken.status).toBe(500);
    expect(broken.body.message).toBe('Could not restore the expiry warning. Try again, and if it keeps happening, tell an administrator.');
  });
});
