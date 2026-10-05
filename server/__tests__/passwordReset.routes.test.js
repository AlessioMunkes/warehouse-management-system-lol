// ─────────────────────────────────────────────────────────────
// server/__tests__/passwordReset.routes.test.js
//
// passwordReset.service.js is mocked, so these tests exercise the
// routes/controller layer only: every route is reachable with no
// session at all (all three are public), and service errors map to
// the right status/reason shape — same split as userInvite.routes.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const serviceMock = {
  requestReset: vi.fn(),
  resolveReset: vi.fn(),
  confirmReset: vi.fn(),
};

vi.mock('../src/services/passwordReset.service.js', () => ({ default: serviceMock }));

const { buildPasswordResetApp } = await import('./helpers/passwordResetApp.js');
const app  = buildPasswordResetApp();
const BASE = '/api/password-reset';

const GENERIC = "If that email is registered, we've sent a link to reset your password.";

const withStatus = (status, message, reason) =>
  Object.assign(new Error(message), { status, ...(reason ? { reason } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.requestReset.mockReturnValue({ message: GENERIC });
  serviceMock.resolveReset.mockResolvedValue({ valid: true });
  serviceMock.confirmReset.mockResolvedValue({ success: true });
});

describe('POST /api/password-reset/request', () => {
  it('is reachable with no session and returns the generic message', async () => {
    const res = await request(app).post(`${BASE}/request`).send({ email: 'jane@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { message: GENERIC } });
  });

  it('passes the email and the requester IP to the service', async () => {
    await request(app).post(`${BASE}/request`).send({ email: 'jane@example.com' });
    expect(serviceMock.requestReset).toHaveBeenCalledWith('jane@example.com', expect.any(String));
  });

  it('returns the same 200/generic shape even with no email in the body', async () => {
    const res = await request(app).post(`${BASE}/request`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { message: GENERIC } });
  });
});

describe('GET /api/password-reset/:token', () => {
  it('is reachable with no session and returns 200 for a valid token', async () => {
    const res = await request(app).get(`${BASE}/sometoken`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { valid: true } });
  });

  it.each([
    [400, 'A reset token is required.', undefined],
    [404, 'This reset link was not found.', undefined],
    [410, 'This reset link has already been used.', 'used'],
    [410, 'A newer reset link was requested since this one was sent. Use the newest email, or request another.', 'superseded'],
    [410, 'This reset link has expired. Request a new one.', 'expired'],
  ])('maps a %i service error (reason=%s) through unchanged', async (status, message, reason) => {
    serviceMock.resolveReset.mockRejectedValue(withStatus(status, message, reason));
    const res = await request(app).get(`${BASE}/badtoken`);
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe(message);
    if (reason) expect(res.body.reason).toBe(reason);
    else expect(res.body.reason).toBeUndefined();
  });

  it('returns the generic 500 message (not the raw error) for an unshaped error', async () => {
    serviceMock.resolveReset.mockRejectedValue(new Error('pool exhausted'));
    const res = await request(app).get(`${BASE}/badtoken`);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Could not load that reset link.');
  });
});

describe('POST /api/password-reset/:token/confirm', () => {
  it('is reachable with no session and returns 200 on success', async () => {
    const res = await request(app).post(`${BASE}/sometoken/confirm`).send({ password: 'longenough1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { success: true } });
  });

  it('passes the token and password through to the service', async () => {
    await request(app).post(`${BASE}/sometoken/confirm`).send({ password: 'longenough1' });
    expect(serviceMock.confirmReset).toHaveBeenCalledWith('sometoken', 'longenough1');
  });

  it('propagates a shaped 400 (e.g. password too short) with its own message', async () => {
    serviceMock.confirmReset.mockRejectedValue(withStatus(400, 'Password must be at least 8 characters.'));
    const res = await request(app).post(`${BASE}/sometoken/confirm`).send({ password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Password must be at least 8 characters.');
  });

  it('returns the generic 500 message for an unshaped error', async () => {
    serviceMock.confirmReset.mockRejectedValue(new Error('boom'));
    const res = await request(app).post(`${BASE}/sometoken/confirm`).send({ password: 'longenough1' });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Could not reset your password.');
  });
});
