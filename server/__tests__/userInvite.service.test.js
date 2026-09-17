// ─────────────────────────────────────────────────────────────
// server/__tests__/userInvite.service.test.js
//
// userInvite.repository.js and user.repository.js are mocked, so
// these tests exercise the service's own rules: token expiry/
// revoked/accepted handling, that role is taken from the invite and
// never the accept request body, and username-collision handling at
// accept time.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn(async (pw) => `hashed:${pw}`) },
}));

const inviteRepoMock = {
  getById:        vi.fn(),
  getByTokenHash:  vi.fn(),
  findOpenByEmail: vi.fn(),
  listPending:     vi.fn(),
  createInvite:    vi.fn(),
  resendInvite:    vi.fn(),
  revokeInvite:    vi.fn(),
  acceptInvite:    vi.fn(),
};

const userRepoMock = {
  findUserByUsername: vi.fn(),
  findUserByEmail:    vi.fn(),
};

vi.mock('../src/repositories/userInvite.repository.js', () => ({ default: inviteRepoMock }));
vi.mock('../src/repositories/user.repository.js', () => ({ default: userRepoMock }));

const { default: userInviteService } = await import('../src/services/userInvite.service.js');

const ADMIN_ID = 1;
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

const existingInvite = (over = {}) => ({
  id: 10, email: 'jane@example.com', role: 'warehouse_worker',
  expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  accepted_at: null, revoked_at: null,
  invited_by: ADMIN_ID, created_at: new Date().toISOString(),
  last_sent_at: new Date().toISOString(), resend_count: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  inviteRepoMock.findOpenByEmail.mockResolvedValue(null);
  userRepoMock.findUserByEmail.mockResolvedValue(null);
  userRepoMock.findUserByUsername.mockResolvedValue(null);
  inviteRepoMock.createInvite.mockImplementation(async (payload) => ({
    id: 10, email: payload.email, role: payload.role,
    expires_at: payload.expiresAt.toISOString(), accepted_at: null, revoked_at: null,
    invited_by: payload.invitedBy, created_at: new Date().toISOString(),
    last_sent_at: new Date().toISOString(), resend_count: 0,
  }));
  inviteRepoMock.getById.mockResolvedValue(existingInvite());
  inviteRepoMock.resendInvite.mockImplementation(async (payload, before) => ({
    ...before, id: payload.id, expires_at: payload.expiresAt.toISOString(),
    last_sent_at: new Date().toISOString(), resend_count: (before.resend_count ?? 0) + 1,
  }));
  inviteRepoMock.revokeInvite.mockImplementation(async (id, before) => ({
    ...before, id, revoked_at: new Date().toISOString(),
  }));
  inviteRepoMock.acceptInvite.mockImplementation(async (payload) => ({
    user: { id: 900, username: payload.username, first_name: payload.firstName,
             last_name: payload.lastName, role: payload.role, is_active: true },
    invite: { id: payload.inviteId, accepted_at: new Date().toISOString() },
  }));
});

// ── createInvite ────────────────────────────────────────────────
describe('createInvite', () => {
  it('requires an email', async () => {
    await expect(userInviteService.createInvite({ role: 'warehouse_worker' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects an obviously malformed email', async () => {
    await expect(userInviteService.createInvite({ email: 'not-an-email', role: 'warehouse_worker' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a role outside the whitelist', async () => {
    await expect(userInviteService.createInvite({ email: 'jane@example.com', role: 'guest' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('409s when the email already belongs to an active user', async () => {
    userRepoMock.findUserByEmail.mockResolvedValue({ id: 5, username: 'jane', email: 'jane@example.com' });
    await expect(userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 409 });
  });

  it('409s when an open invite already exists for that email', async () => {
    inviteRepoMock.findOpenByEmail.mockResolvedValue(existingInvite());
    await expect(userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 409 });
  });

  it('returns the raw token and a url alongside the invite, and stores only its hash', async () => {
    const result = await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
    expect(result.token).toBeTypeOf('string');
    expect(result.url).toContain(encodeURIComponent(result.token));

    const passedHash = inviteRepoMock.createInvite.mock.calls[0][0].tokenHash;
    expect(passedHash).toBe(sha256(result.token));
    expect(result.invite).not.toHaveProperty('tokenHash');
  });

  it('sets a 7-day expiry', async () => {
    const before = Date.now();
    await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
    const expiresAt = inviteRepoMock.createInvite.mock.calls[0][0].expiresAt.getTime();
    const days = (expiresAt - before) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });
});

// ── resendInvite / revokeInvite ─────────────────────────────────
describe('resendInvite', () => {
  it('404s when the invite does not exist', async () => {
    inviteRepoMock.getById.mockResolvedValue(null);
    await expect(userInviteService.resendInvite(10, ADMIN_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('409s on an already-accepted invite', async () => {
    inviteRepoMock.getById.mockResolvedValue(existingInvite({ accepted_at: new Date().toISOString() }));
    await expect(userInviteService.resendInvite(10, ADMIN_ID)).rejects.toMatchObject({ status: 409 });
    expect(inviteRepoMock.resendInvite).not.toHaveBeenCalled();
  });

  it('409s on a revoked invite', async () => {
    inviteRepoMock.getById.mockResolvedValue(existingInvite({ revoked_at: new Date().toISOString() }));
    await expect(userInviteService.resendInvite(10, ADMIN_ID)).rejects.toMatchObject({ status: 409 });
    expect(inviteRepoMock.resendInvite).not.toHaveBeenCalled();
  });

  it('issues a new token, invalidating the previous one', async () => {
    const first = await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
    const result = await userInviteService.resendInvite(10, ADMIN_ID);
    expect(result.token).not.toBe(first.token);
  });
});

describe('revokeInvite', () => {
  it('404s when the invite does not exist', async () => {
    inviteRepoMock.getById.mockResolvedValue(null);
    await expect(userInviteService.revokeInvite(10, ADMIN_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('409s on an already-accepted invite — an accepted invite cannot be revoked', async () => {
    inviteRepoMock.getById.mockResolvedValue(existingInvite({ accepted_at: new Date().toISOString() }));
    await expect(userInviteService.revokeInvite(10, ADMIN_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('is idempotent on an already-revoked invite', async () => {
    inviteRepoMock.getById.mockResolvedValue(existingInvite({ revoked_at: new Date().toISOString() }));
    await userInviteService.revokeInvite(10, ADMIN_ID);
    expect(inviteRepoMock.revokeInvite).not.toHaveBeenCalled();
  });

  // Caught only by hitting the live API during a smoke test, not by any
  // mocked unit test: the repository always returns raw snake_case
  // columns, so any service method that forgets to map through
  // toPublicInvite leaks that shape straight into the API response.
  it('maps the returned invite through the same shape as create/list/resend (camelCase, no raw columns)', async () => {
    const result = await userInviteService.revokeInvite(10, ADMIN_ID);
    expect(result).not.toHaveProperty('revoked_at');
    expect(result).not.toHaveProperty('created_at');
    expect(result).toHaveProperty('revokedAt');
    expect(result).toHaveProperty('createdAt');
  });
});

// ── resolveInviteByToken ─────────────────────────────────────────
describe('resolveInviteByToken', () => {
  it('400s on a missing token', async () => {
    await expect(userInviteService.resolveInviteByToken('')).rejects.toMatchObject({ status: 400 });
  });

  it('404s when no invite matches the token hash', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(null);
    await expect(userInviteService.resolveInviteByToken('whatever')).rejects.toMatchObject({ status: 404 });
  });

  it('410s with reason "expired" on an expired token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(
      existingInvite({ expires_at: new Date(Date.now() - 1000).toISOString() })
    );
    await expect(userInviteService.resolveInviteByToken('tok'))
      .rejects.toMatchObject({ status: 410, reason: 'expired' });
  });

  it('410s with reason "revoked" on a revoked token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(
      existingInvite({ revoked_at: new Date().toISOString() })
    );
    await expect(userInviteService.resolveInviteByToken('tok'))
      .rejects.toMatchObject({ status: 410, reason: 'revoked' });
  });

  it('410s with reason "accepted" on an already-used token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(
      existingInvite({ accepted_at: new Date().toISOString() })
    );
    await expect(userInviteService.resolveInviteByToken('tok'))
      .rejects.toMatchObject({ status: 410, reason: 'accepted' });
  });

  it('returns the invite (without the token hash) for a valid token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite());
    const result = await userInviteService.resolveInviteByToken('tok');
    expect(result.email).toBe('jane@example.com');
    expect(result).not.toHaveProperty('token_hash');
  });
});

// ── acceptInvite ──────────────────────────────────────────────────
const acceptBody = (over = {}) => ({
  username: 'janed', firstName: 'Jane', lastName: 'Doe', password: 'longenough1', ...over,
});

describe('acceptInvite', () => {
  it('400s on a missing token', async () => {
    await expect(userInviteService.acceptInvite('', acceptBody())).rejects.toMatchObject({ status: 400 });
  });

  it('404s when no invite matches the token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(null);
    await expect(userInviteService.acceptInvite('tok', acceptBody())).rejects.toMatchObject({ status: 404 });
  });

  it('410s with reason "expired" on an expired token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(
      existingInvite({ expires_at: new Date(Date.now() - 1000).toISOString() })
    );
    await expect(userInviteService.acceptInvite('tok', acceptBody()))
      .rejects.toMatchObject({ status: 410, reason: 'expired' });
    expect(inviteRepoMock.acceptInvite).not.toHaveBeenCalled();
  });

  it('410s with reason "revoked" on a revoked token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(
      existingInvite({ revoked_at: new Date().toISOString() })
    );
    await expect(userInviteService.acceptInvite('tok', acceptBody()))
      .rejects.toMatchObject({ status: 410, reason: 'revoked' });
    expect(inviteRepoMock.acceptInvite).not.toHaveBeenCalled();
  });

  it('410s with reason "accepted" on an already-used token', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(
      existingInvite({ accepted_at: new Date().toISOString() })
    );
    await expect(userInviteService.acceptInvite('tok', acceptBody()))
      .rejects.toMatchObject({ status: 410, reason: 'accepted' });
    expect(inviteRepoMock.acceptInvite).not.toHaveBeenCalled();
  });

  it('409s on a username that is already taken', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite());
    userRepoMock.findUserByUsername.mockResolvedValue({ id: 5, username: 'janed' });
    await expect(userInviteService.acceptInvite('tok', acceptBody()))
      .rejects.toMatchObject({ status: 409 });
    expect(inviteRepoMock.acceptInvite).not.toHaveBeenCalled();
  });

  it('rejects a password under 8 characters', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite());
    await expect(userInviteService.acceptInvite('tok', acceptBody({ password: 'short' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires a username, first name and last name', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite());
    await expect(userInviteService.acceptInvite('tok', acceptBody({ username: '' })))
      .rejects.toMatchObject({ status: 400 });
    await expect(userInviteService.acceptInvite('tok', acceptBody({ firstName: '' })))
      .rejects.toMatchObject({ status: 400 });
    await expect(userInviteService.acceptInvite('tok', acceptBody({ lastName: '' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('IGNORES a role in the accept body — the invite\'s own role is the only source of truth', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite({ role: 'warehouse_worker' }));
    await userInviteService.acceptInvite('tok', acceptBody({ role: 'admin' }));
    const call = inviteRepoMock.acceptInvite.mock.calls[0][0];
    expect(call.role).toBe('warehouse_worker');
  });

  it('hashes the password before handing it to the repository', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite());
    await userInviteService.acceptInvite('tok', acceptBody({ password: 'longenough1' }));
    const call = inviteRepoMock.acceptInvite.mock.calls[0][0];
    expect(call.passwordHash).toBe('hashed:longenough1');
    expect(call.password).toBeUndefined();
  });

  it('copies email from the invite, not from the request body', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite({ email: 'jane@example.com' }));
    await userInviteService.acceptInvite('tok', acceptBody({ email: 'someone-else@example.com' }));
    const call = inviteRepoMock.acceptInvite.mock.calls[0][0];
    expect(call.email).toBe('jane@example.com');
  });

  it('returns the created user on success', async () => {
    inviteRepoMock.getByTokenHash.mockResolvedValue(existingInvite());
    const user = await userInviteService.acceptInvite('tok', acceptBody());
    expect(user.username).toBe('janed');
  });
});
