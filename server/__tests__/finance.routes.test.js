import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  getFinanceSummary: vi.fn(),
  getPublicFinanceSummary: vi.fn(),
  regenerateReportLink: vi.fn(),
  revokeReportLink: vi.fn(),
  getEmailSettings: vi.fn(),
  saveEmailSettings: vi.fn(),
  sendFinanceReportLink: vi.fn(),
};

vi.mock('../src/services/finance.service.js', () => ({ default: serviceMock }));

const { buildFinanceApp } = await import('./helpers/financeApp.js');
const app = buildFinanceApp();
const BASE = '/api/finance/report';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  return [`wms_token=${token}`];
};

const REPORT = {
  movements: [
    {
      movement_type: 'received',
      reference_id: '10',
      movement_date: '2026-09-20',
      source_destination: 'Supplier A',
      product: 'Rice',
      quantity: '12',
      unit: 'bag',
      monetary_value: '240.00',
    },
  ],
};

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.getFinanceSummary.mockResolvedValue(REPORT);
  serviceMock.getPublicFinanceSummary.mockResolvedValue(REPORT);
  serviceMock.regenerateReportLink.mockResolvedValue({
    token: 'public-token',
    publicPath: '/api/finance/public/public-token/report',
    link: { id: 1 },
  });
  serviceMock.revokeReportLink.mockResolvedValue({ revokedCount: 1 });
  serviceMock.getEmailSettings.mockResolvedValue({ recipientEmail: 'finance@example.org' });
  serviceMock.saveEmailSettings.mockResolvedValue({ recipientEmail: 'finance@example.org' });
  serviceMock.sendFinanceReportLink.mockResolvedValue({
    sent: true,
    recipientEmail: 'finance@example.org',
    publicUrl: '/finance/report/public-token',
    messageId: 'gmail-1',
  });
});

describe('finance report route - authentication', () => {
  it('returns 401 with no cookie', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
    expect(serviceMock.getFinanceSummary).not.toHaveBeenCalled();
  });

  it('returns 401 with an unverifiable token', async () => {
    const res = await request(app).get(BASE).set('Cookie', ['wms_token=not-a-real-jwt']);
    expect(res.status).toBe(401);
    expect(serviceMock.getFinanceSummary).not.toHaveBeenCalled();
  });
});

describe('finance email settings and send routes', () => {
  it('lets admins read and save finance recipient settings', async () => {
    const getRes = await request(app)
      .get('/api/finance/email-settings')
      .set('Cookie', cookieFor(ROLES.ADMIN));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.recipientEmail).toBe('finance@example.org');

    const postRes = await request(app)
      .post('/api/finance/email-settings')
      .set('Cookie', cookieFor(ROLES.ADMIN))
      .send({ recipientEmail: 'finance@example.org' });

    expect(postRes.status).toBe(200);
    expect(serviceMock.saveEmailSettings).toHaveBeenCalledWith({
      recipientEmail: 'finance@example.org',
      updatedBy: 1,
    });
  });

  it('lets admins send the finance report link', async () => {
    const res = await request(app)
      .post('/api/finance/report-link/send')
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.messageId).toBe('gmail-1');
    expect(serviceMock.sendFinanceReportLink).toHaveBeenCalledWith({ sentBy: 1 });
  });

  it('surfaces send failures from the service', async () => {
    serviceMock.sendFinanceReportLink.mockRejectedValueOnce(withStatus(502, 'Gmail down'));

    const res = await request(app)
      .post('/api/finance/report-link/send')
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(502);
    expect(res.body.message).toBe('Failed to send finance report link.');
  });

  it.each([ROLES.WORKER, ROLES.MANAGER, ROLES.GUEST, 'finance'])('does not let %s manage finance email settings', async (role) => {
    const res = await request(app)
      .post('/api/finance/email-settings')
      .set('Cookie', cookieFor(role))
      .send({ recipientEmail: 'finance@example.org' });

    expect(res.status).toBe(403);
    expect(serviceMock.saveEmailSettings).not.toHaveBeenCalled();
  });
});

describe('finance public report link', () => {
  it('returns the same report data without a WMS login', async () => {
    const res = await request(app)
      .get('/api/finance/public/public-token/report')
      .query({ from: '2026-09-01', movementType: 'received' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: REPORT });
    expect(serviceMock.getPublicFinanceSummary).toHaveBeenCalledWith('public-token', {
      from: '2026-09-01',
      movementType: 'received',
    });
  });

  it('returns 404 for an invalid or revoked link', async () => {
    serviceMock.getPublicFinanceSummary.mockRejectedValueOnce(withStatus(404, 'Finance report link is invalid or has been revoked.'));

    const res = await request(app).get('/api/finance/public/revoked/report');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Finance report link is invalid or has been revoked.');
  });
});

describe('finance report link management', () => {
  it('lets admins regenerate a public report link', async () => {
    const res = await request(app)
      .post('/api/finance/report-link/regenerate')
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBe('public-token');
    expect(serviceMock.regenerateReportLink).toHaveBeenCalledWith({ createdBy: 1 });
  });

  it('lets admins revoke the public report link', async () => {
    const res = await request(app)
      .post('/api/finance/report-link/revoke')
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revokedCount: 1 });
    expect(serviceMock.revokeReportLink).toHaveBeenCalledWith({ revokedBy: 1 });
  });

  it.each([ROLES.WORKER, ROLES.MANAGER, ROLES.GUEST, 'finance'])('does not let %s manage links', async (role) => {
    const res = await request(app)
      .post('/api/finance/report-link/regenerate')
      .set('Cookie', cookieFor(role));

    expect(res.status).toBe(403);
    expect(serviceMock.regenerateReportLink).not.toHaveBeenCalled();
  });
});

describe('finance report route - admin access only', () => {
  it('allows admin users', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(200);
    expect(serviceMock.getFinanceSummary).toHaveBeenCalledTimes(1);
  });

  it.each([ROLES.WORKER, ROLES.MANAGER, ROLES.GUEST, 'finance'])('rejects %s', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
    expect(serviceMock.getFinanceSummary).not.toHaveBeenCalled();
  });
});

describe('finance report route - controller contract', () => {
  it('passes existing report filters through to the service', async () => {
    await request(app)
      .get(BASE)
      .query({ from: '2026-09-01', to: '2026-09-20', movementType: 'received,donated', limit: '50' })
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(serviceMock.getFinanceSummary).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-20',
      movementType: 'received,donated',
      limit: '50',
    });
  });

  it('wraps the report in the standard response envelope', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: REPORT });
  });

  it('honours validation statuses from the service', async () => {
    serviceMock.getFinanceSummary.mockRejectedValueOnce(withStatus(400, 'Limit must be a whole number between 1 and 500.'));

    const res = await request(app)
      .get(BASE)
      .query({ limit: 'nope' })
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Limit must be a whole number between 1 and 500.',
    });
  });

  it('masks unexpected service failures', async () => {
    serviceMock.getFinanceSummary.mockRejectedValueOnce(new Error('password authentication failed for user "postgres"'));

    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to retrieve finance report.' });
  });
});
