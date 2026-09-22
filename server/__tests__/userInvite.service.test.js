// ─────────────────────────────────────────────────────────────
// server/__tests__/userInvite.service.test.js
//
// userInvite.repository.js, user.repository.js and email.provider.js
// are all mocked, so these tests exercise the service's own rules:
// token expiry/revoked/accepted handling, that role is taken from the
// invite and never the accept request body, username-collision
// handling at accept time, and that email.provider.js's three
// possible outcomes (sent / stubbed / failed) are never conflated.
//
// email.provider.js MUST be mocked here. Left real, createInvite's
// send attempt would fall through to the actual gmail.service.js path
// — a real network call and a real DATABASE_URL query for a Gmail
// connection row, on every single test run.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn(async (pw) => `hashed:${pw}`) },
}));

const inviteRepoMock = {
  getById:            vi.fn(),
  getByTokenHash:     vi.fn(),
  findOpenByEmail:    vi.fn(),
  listPending:        vi.fn(),
  createInvite:       vi.fn(),
  resendInvite:       vi.fn(),
  revokeInvite:       vi.fn(),
  acceptInvite:       vi.fn(),
  recordEmailAttempt: vi.fn(),
};

const userRepoMock = {
  findUserByUsername: vi.fn(),
  findUserByEmail:    vi.fn(),
  getUserById:        vi.fn(),
};

const emailProviderMock = {
  sendEmail: vi.fn(),
};

vi.mock('../src/repositories/userInvite.repository.js', () => ({ default: inviteRepoMock }));
vi.mock('../src/repositories/user.repository.js', () => ({ default: userRepoMock }));
vi.mock('../src/providers/email.provider.js', () => ({ default: emailProviderMock }));

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
  userRepoMock.getUserById.mockResolvedValue({ id: ADMIN_ID, first_name: 'Sys', last_name: 'Admin' });
  inviteRepoMock.recordEmailAttempt.mockResolvedValue(undefined);
  // Default: a real send that succeeds. Individual tests override this
  // to exercise stubbed/failed.
  emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'msg-1' });
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

  // ── The three email outcomes ──────────────────────────────────
  // The invite itself must exist and be returned successfully in
  // every one of these — none is allowed to turn createInvite into a
  // rejected promise.
  describe('email send outcomes', () => {
    it('reports sent:true when the provider genuinely sends', async () => {
      emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'msg-1' });
      const result = await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
      expect(result.email).toEqual({ sent: true, stubbed: false, error: null });
      expect(result.invite.emailStatus).toBe('sent');
      expect(inviteRepoMock.recordEmailAttempt).toHaveBeenCalledWith(10, { status: 'sent', error: null });
    });

    it('never reports stubbed as sent — EMAIL_ENABLED=false path', async () => {
      emailProviderMock.sendEmail.mockResolvedValue({
        sent: true, stubbed: true, messageId: 'stub-1', reason: 'Email disabled via EMAIL_ENABLED flag.',
      });
      const result = await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
      expect(result.email.sent).toBe(false);
      expect(result.email.stubbed).toBe(true);
      expect(result.invite.emailStatus).toBe('stubbed');
      expect(inviteRepoMock.recordEmailAttempt).toHaveBeenCalledWith(10, { status: 'stubbed', error: null });
    });

    it('reports a clear failure — e.g. no Gmail account connected — without failing the invite', async () => {
      emailProviderMock.sendEmail.mockResolvedValue({
        sent: false, error: 'No organisation Gmail account is connected. An admin must connect Gmail first.',
      });
      const result = await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
      expect(result.invite.id).toBe(10); // the invite still exists
      expect(result.token).toBeTypeOf('string'); // the link is still there
      expect(result.email).toEqual({
        sent: false, stubbed: false,
        error: 'No organisation Gmail account is connected. An admin must connect Gmail first.',
      });
      expect(result.invite.emailStatus).toBe('failed');
    });

    // inviteRepo.createInvite's INSERT...RETURNING runs BEFORE the send
    // is even attempted, so the raw row it returns always has
    // email_error/email_attempted_at still null — toPublicInvite alone
    // would silently show emailStatus: 'failed' next to emailError:
    // null, which is not what actually happened. The response must
    // reflect the send that was JUST attempted, not the pre-attempt
    // snapshot.
    it('the returned invite.emailError/emailAttemptedAt match the outcome just attempted, not the pre-send snapshot', async () => {
      emailProviderMock.sendEmail.mockResolvedValue({ sent: false, error: 'boom' });
      const before = Date.now();
      const result = await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
      expect(result.invite.emailStatus).toBe('failed');
      expect(result.invite.emailError).toBe('boom');
      expect(new Date(result.invite.emailAttemptedAt).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('survives the provider throwing outright, still returning the invite', async () => {
      emailProviderMock.sendEmail.mockRejectedValue(new Error('ECONNRESET'));
      const result = await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
      expect(result.invite.id).toBe(10);
      expect(result.email.sent).toBe(false);
      expect(result.email.error).toBe('ECONNRESET');
    });

    it('sends via the organisation account (userId=null to the provider), never as the acting admin', async () => {
      await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
      expect(emailProviderMock.sendEmail).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('names the original inviter in the email body, looked up by invited_by', async () => {
      userRepoMock.getUserById.mockResolvedValue({ id: ADMIN_ID, first_name: 'Grizel', last_name: 'Goliath' });
      await userInviteService.createInvite({ email: 'jane@example.com', role: 'warehouse_worker' }, ADMIN_ID);
      expect(userRepoMock.getUserById).toHaveBeenCalledWith(ADMIN_ID);
      const emailArg = emailProviderMock.sendEmail.mock.calls[0][0];
      expect(emailArg.text).toContain('Grizel Goliath');
    });
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

  it('attempts a fresh email send, same as create, and records its outcome', async () => {
    emailProviderMock.sendEmail.mockResolvedValue({ sent: false, error: 'No organisation Gmail account is connected.' });
    const result = await userInviteService.resendInvite(10, ADMIN_ID);
    expect(result.email).toEqual({ sent: false, stubbed: false, error: 'No organisation Gmail account is connected.' });
    expect(inviteRepoMock.recordEmailAttempt).toHaveBeenCalledWith(10, { status: 'failed', error: 'No organisation Gmail account is connected.' });
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
