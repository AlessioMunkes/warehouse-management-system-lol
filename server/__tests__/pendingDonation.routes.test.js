import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  createPendingDonationFromIntake: vi.fn(),
  resolveFlagAndMaybeCommit: vi.fn(),
  retryCommit: vi.fn(),
};

const repoMock = {
  getPendingDonationById: vi.fn(),
  listPendingDonationsByStatus: vi.fn(),
  listPendingDonationsWithItems: vi.fn(),
};

vi.mock('../src/services/pendingDonation.service.js', () => ({ default: serviceMock }));
vi.mock('../src/repositories/pendingDonation.repository.js', () => ({ default: repoMock }));

const { buildPendingDonationApp } = await import('./helpers/pendingDonationApp.js');
const app = buildPendingDonationApp();
const BASE = '/api/donations/pending';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.createPendingDonationFromIntake.mockResolvedValue({ id: 10, status: 'awaiting_resolution', items: [] });
  serviceMock.resolveFlagAndMaybeCommit.mockResolvedValue({ pendingDonationId: 10, status: 'awaiting_resolution' });
  serviceMock.retryCommit.mockResolvedValue({ id: 10, status: 'committed' });
  repoMock.getPendingDonationById.mockResolvedValue({ id: 10, status: 'awaiting_resolution', items: [] });
  repoMock.listPendingDonationsByStatus.mockResolvedValue([{ id: 10, status: 'commit_incomplete' }]);
  repoMock.listPendingDonationsWithItems.mockResolvedValue([
    {
      id: 10,
      status: 'awaiting_resolution',
      items: [],
      item_counts: { total: 0, resolved: 0, awaiting_resolution: 0, rejected: 0 },
    },
  ]);
});

describe('pending donation routes', () => {
  it('creates pending donations for the same roles that can record donations', async () => {
    for (const role of [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN]) {
      const res = await request(app)
        .post(BASE)
        .set('Cookie', cookieFor(role, { id: 55 }))
        .send({ createdBy: 999, donorName: 'Body Donor', items: [] });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { id: 10, status: 'awaiting_resolution', items: [] },
      });
    }

    expect(serviceMock.createPendingDonationFromIntake.mock.calls.every((call) => call[0].createdBy === 55)).toBe(true);
  });

  it('does not allow finance to create a pending donation', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Cookie', cookieFor(ROLES.FINANCE))
      .send({});

    expect(res.status).toBe(403);
    expect(serviceMock.createPendingDonationFromIntake).not.toHaveBeenCalled();
  });

  it('restricts flag resolution to admin only and attributes resolution to the session user', async () => {
    const managerResolve = await request(app)
      .post(`${BASE}/flags/7/resolve`)
      .set('Cookie', cookieFor(ROLES.MANAGER))
      .send({ accepted: true, category: 'recipe_food', resolvedBy: 999 });

    expect(managerResolve.status).toBe(403);
    expect(serviceMock.resolveFlagAndMaybeCommit).not.toHaveBeenCalled();

    const adminResolve = await request(app)
      .post(`${BASE}/flags/7/resolve`)
      .set('Cookie', cookieFor(ROLES.ADMIN, { id: 88 }))
      .send({ accepted: true, category: 'recipe_food', resolvedBy: 999 });

    expect(adminResolve.status).toBe(200);
    // The body-supplied resolvedBy must never win over the session user.
    expect(serviceMock.resolveFlagAndMaybeCommit).toHaveBeenCalledTimes(1);
    expect(serviceMock.resolveFlagAndMaybeCommit.mock.calls[0][0]).toBe(7);
    expect(serviceMock.resolveFlagAndMaybeCommit.mock.calls[0][1].resolvedBy).toBe(88);
  });

  it('restricts retry and reconciliation to admin only', async () => {
    const managerRetry = await request(app)
      .post(`${BASE}/10/retry-commit`)
      .set('Cookie', cookieFor(ROLES.MANAGER))
      .send({});
    const managerQueue = await request(app)
      .get(`${BASE}/reconciliation`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(managerRetry.status).toBe(403);
    expect(managerQueue.status).toBe(403);

    const adminRetry = await request(app)
      .post(`${BASE}/10/retry-commit`)
      .set('Cookie', cookieFor(ROLES.ADMIN))
      .send({});
    const adminQueue = await request(app)
      .get(`${BASE}/reconciliation`)
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(adminRetry.status).toBe(200);
    expect(adminQueue.status).toBe(200);
    expect(repoMock.listPendingDonationsByStatus).toHaveBeenCalledWith(['commit_failed', 'commit_incomplete']);
  });

  it('surfaces retryCommit 409 messages from the service', async () => {
    serviceMock.retryCommit.mockRejectedValue(
      withStatus(409, "Retry commit is only valid for status 'commit_failed' or 'commit_incomplete'; current status is 'committed'.")
    );

    const res = await request(app)
      .post(`${BASE}/10/retry-commit`)
      .set('Cookie', cookieFor(ROLES.ADMIN))
      .send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "Retry commit is only valid for status 'commit_failed' or 'commit_incomplete'; current status is 'committed'.",
    });
  });

  it('fetches a single pending donation and returns 404 when missing', async () => {
    const found = await request(app)
      .get(`${BASE}/10`)
      .set('Cookie', cookieFor(ROLES.WORKER));

    expect(found.status).toBe(200);
    expect(repoMock.getPendingDonationById).toHaveBeenCalledWith(10);

    repoMock.getPendingDonationById.mockResolvedValueOnce(null);
    const missing = await request(app)
      .get(`${BASE}/999`)
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Pending donation not found.' });
  });

  it('rejects invalid pending route ids before reaching service or repository', async () => {
    const retry = await request(app)
      .post(`${BASE}/abc/retry-commit`)
      .set('Cookie', cookieFor(ROLES.ADMIN))
      .send({});
    const flag = await request(app)
      .post(`${BASE}/flags/0/resolve`)
      .set('Cookie', cookieFor(ROLES.ADMIN))
      .send({});
    const detail = await request(app)
      .get(`${BASE}/-1`)
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(retry.status).toBe(400);
    expect(flag.status).toBe(400);
    expect(detail.status).toBe(400);
    expect(serviceMock.retryCommit).not.toHaveBeenCalled();
    expect(serviceMock.resolveFlagAndMaybeCommit).not.toHaveBeenCalled();
    expect(repoMock.getPendingDonationById).not.toHaveBeenCalled();
  });
});

describe('GET /api/donations/pending — donation management list endpoint', () => {
  // NOTE: BASE already ends in /pending — the list route is exactly
  // /api/donations/pending, so no suffix goes here. Appending /pending
  // would hit GET /pending/:id param parsing instead (as a failed first
  // run proved live).
  it('serves admin requests with the D4 default status scope when no filter is given', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: 10,
          status: 'awaiting_resolution',
          item_counts: { total: 0, resolved: 0, awaiting_resolution: 0, rejected: 0 },
        }),
      ],
    });
    // Static path must not be swallowed by GET /pending/:id param parsing.
    expect(repoMock.getPendingDonationById).not.toHaveBeenCalled();
    expect(repoMock.listPendingDonationsWithItems).toHaveBeenCalledWith(['awaiting_resolution', 'committing']);
  });

  it('parses, trims and dedupes an explicit statuses CSV', async () => {
    const res = await request(app)
      .get(`${BASE}?statuses=commit_failed, commit_incomplete,commit_failed`)
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(200);
    expect(repoMock.listPendingDonationsWithItems).toHaveBeenCalledWith(['commit_failed', 'commit_incomplete']);
  });

  it('rejects unknown statuses with 400 before reaching the repository', async () => {
    const res = await request(app)
      .get(`${BASE}?statuses=awaiting_resolution,bogus`)
      .set('Cookie', cookieFor(ROLES.ADMIN));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/bogus/);
    expect(repoMock.listPendingDonationsWithItems).not.toHaveBeenCalled();
  });

  it('is admin-only, matching its reconciliation sibling', async () => {
    for (const role of [ROLES.WORKER, ROLES.MANAGER, ROLES.FINANCE]) {
      const res = await request(app)
        .get(BASE)
        .set('Cookie', cookieFor(role));

      expect(res.status).toBe(403);
    }

    expect(repoMock.listPendingDonationsWithItems).not.toHaveBeenCalled();
  });
});
