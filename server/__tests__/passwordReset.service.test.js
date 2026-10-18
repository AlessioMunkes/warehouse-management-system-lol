// ─────────────────────────────────────────────────────────────
// server/__tests__/passwordReset.service.test.js
//
// passwordReset.repository.js, user.repository.js and
// email.provider.js are all mocked, so these tests exercise the
// service's own rules: no account enumeration (including under a
// found-user-path error), no timing oracle on requestReset, the
// per-email throttle, token expiry/used/superseded handling, and the
// active/archived recheck at confirm time.
//
// email.provider.js MUST be mocked here — left real, a found-user
// request would fall through to the actual gmail.service.js path, a
// real network call and a real DATABASE_URL query, on every test run.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn(async (pw) => `hashed:${pw}`) },
}));

const resetRepoMock = {
  findRecentActiveByUserId: vi.fn(),
  getByTokenHash:           vi.fn(),
  createReset:              vi.fn(),
  recordEmailAttempt:       vi.fn(),
  confirmReset:             vi.fn(),
};

const userRepoMock = {
  findUserByEmail: vi.fn(),
  getUserById:     vi.fn(),
};

const emailProviderMock = {
  sendEmail: vi.fn(),
};

vi.mock('../src/repositories/passwordReset.repository.js', () => ({ default: resetRepoMock }));
vi.mock('../src/repositories/user.repository.js', () => ({ default: userRepoMock }));
vi.mock('../src/integrations/email.provider.js', () => ({ default: emailProviderMock }));

const { default: passwordResetService } = await import('../src/services/passwordReset.service.js');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const GENERIC = "If that email is registered, we've sent a link to reset your password.";

const ACTIVE_USER  = { id: 5, username: 'jane', email: 'jane@example.com' };
const ACTIVE_ACCOUNT = { id: 5, username: 'jane', is_active: true, archived_at: null };

const existingReset = (over = {}) => ({
  id: 20, user_id: 5, token_hash: 'irrelevant',
  expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  used_at: null, superseded_at: null,
  requested_ip: null, created_at: new Date().toISOString(),
  ...over,
});

// Fire-and-forget work is kicked off but not awaited by requestReset
// itself — give the microtask queue a turn before asserting on it.
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  userRepoMock.findUserByEmail.mockResolvedValue(null);
  userRepoMock.getUserById.mockResolvedValue(ACTIVE_ACCOUNT);
  resetRepoMock.findRecentActiveByUserId.mockResolvedValue(null);
  resetRepoMock.recordEmailAttempt.mockResolvedValue(undefined);
  resetRepoMock.createReset.mockImplementation(async (payload) => ({
    id: 20, user_id: payload.userId, token_hash: payload.tokenHash,
    expires_at: payload.expiresAt.toISOString(), used_at: null, superseded_at: null,
    requested_ip: payload.requestedIp, created_at: new Date().toISOString(),
  }));
  emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'msg-1' });
  resetRepoMock.getByTokenHash.mockResolvedValue(existingReset());
  resetRepoMock.confirmReset.mockResolvedValue(existingReset({ used_at: new Date().toISOString() }));
});


const NO_ADDRESS_VARS = [
  'APP_BASE_URL', 'USER_INVITE_BASE_URL', 'PASSWORD_RESET_BASE_URL', 'SECTION18A_FORM_BASE_URL',
  'CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN',
];
const inProductionWithNoAddress = async (fn) => {
  vi.stubEnv('NODE_ENV', 'production');
  NO_ADDRESS_VARS.forEach((name) => vi.stubEnv(name, ''));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await fn(log);
  } finally {
    log.mockRestore();
    vi.unstubAllEnvs();
  }
};

describe('requestReset — a server with no web address (production)', () => {
  it('creates no reset and sends no email with a broken link, but still answers the same', async () => {
    await inProductionWithNoAddress(async (log) => {
      userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
      const result = passwordResetService.requestReset('jane@example.com', '1.2.3.4');
      await flush();

      expect(result).toEqual({ message: GENERIC });
      expect(resetRepoMock.createReset).not.toHaveBeenCalled();
      expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
      expect(log.mock.calls.some(([m]) => String(m).includes('[links]'))).toBe(true);
    });
  });

  it('builds the link from CLIENT_URL on a server that only sets the older names', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_BASE_URL', '');
    vi.stubEnv('PASSWORD_RESET_BASE_URL', '');
    vi.stubEnv('CLIENT_URL', 'https://wms.example');
    try {
      userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
      passwordResetService.requestReset('jane@example.com', '1.2.3.4');
      await flush();
      expect(emailProviderMock.sendEmail.mock.calls[0][0].text).toContain('https://wms.example/reset-password/');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ── No account enumeration / no timing oracle ────────────────────
describe('requestReset — no enumeration, no timing oracle', () => {
  it('returns the generic message for an unknown email', () => {
    const result = passwordResetService.requestReset('nobody@example.com', '1.2.3.4');
    expect(result).toEqual({ message: GENERIC });
  });

  it('returns the identical generic message for a known, active email', () => {
    userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
    const result = passwordResetService.requestReset('jane@example.com', '1.2.3.4');
    expect(result).toEqual({ message: GENERIC });
  });

  it('does not await the lookup/email work before returning', () => {
    // Never-resolving lookup — if requestReset awaited this internally,
    // this test would hang/time out instead of returning immediately.
    userRepoMock.findUserByEmail.mockReturnValue(new Promise(() => {}));
    const result = passwordResetService.requestReset('jane@example.com', '1.2.3.4');
    expect(result).toEqual({ message: GENERIC });
  });

  it('creates a reset and sends an email for a known, active user (fire-and-forget)', async () => {
    userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
    passwordResetService.requestReset('jane@example.com', '1.2.3.4');
    await flush();
    expect(resetRepoMock.createReset).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, requestedIp: '1.2.3.4' })
    );
    expect(emailProviderMock.sendEmail).toHaveBeenCalled();
  });

  it('does nothing for an unknown email (no reset row, no email)', async () => {
    passwordResetService.requestReset('nobody@example.com', '1.2.3.4');
    await flush();
    expect(resetRepoMock.createReset).not.toHaveBeenCalled();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });

  it('does nothing for an inactive account', async () => {
    userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
    userRepoMock.getUserById.mockResolvedValue({ ...ACTIVE_ACCOUNT, is_active: false });
    passwordResetService.requestReset('jane@example.com', '1.2.3.4');
    await flush();
    expect(resetRepoMock.createReset).not.toHaveBeenCalled();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });

  it('does nothing for an archived account', async () => {
    userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
    userRepoMock.getUserById.mockResolvedValue({ ...ACTIVE_ACCOUNT, archived_at: new Date().toISOString() });
    passwordResetService.requestReset('jane@example.com', '1.2.3.4');
    await flush();
    expect(resetRepoMock.createReset).not.toHaveBeenCalled();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });

  it('normalises email: trims and lowercases before lookup', async () => {
    userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
    passwordResetService.requestReset('  Jane@Example.com  ', '1.2.3.4');
    await flush();
    expect(userRepoMock.findUserByEmail).toHaveBeenCalledWith('jane@example.com');
  });

  it('an error anywhere in the found-user path still leaves the response identical to the unknown-email case', async () => {
    userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
    resetRepoMock.createReset.mockRejectedValue(new Error('DB is on fire'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = passwordResetService.requestReset('jane@example.com', '1.2.3.4');
    expect(result).toEqual({ message: GENERIC });

    await flush();
    // The rejection was caught and logged server-side, never thrown
    // out to the caller.
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ── Per-email throttle ────────────────────────────────────────
describe('requestReset — per-email throttle', () => {
  it('does not create a new reset or send another email when a live one was created in the last 5 minutes', async () => {
    userRepoMock.findUserByEmail.mockResolvedValue(ACTIVE_USER);
    resetRepoMock.findRecentActiveByUserId.mockResolvedValue(existingReset());

    const result = passwordResetService.requestReset('jane@example.com', '1.2.3.4');
    expect(result).toEqual({ message: GENERIC });

    await flush();
    expect(resetRepoMock.createReset).not.toHaveBeenCalled();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });
});

// ── Resolve ───────────────────────────────────────────────────
describe('resolveReset', () => {
  it('rejects a malformed/empty token with 400', async () => {
    await expect(passwordResetService.resolveReset('')).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown token with 404', async () => {
    resetRepoMock.getByTokenHash.mockResolvedValue(null);
    await expect(passwordResetService.resolveReset('abc')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a used token with 410/reason=used', async () => {
    resetRepoMock.getByTokenHash.mockResolvedValue(existingReset({ used_at: new Date().toISOString() }));
    await expect(passwordResetService.resolveReset('abc')).rejects.toMatchObject({ status: 410, reason: 'used' });
  });

  it('rejects a superseded token with 410/reason=superseded', async () => {
    resetRepoMock.getByTokenHash.mockResolvedValue(existingReset({ superseded_at: new Date().toISOString() }));
    await expect(passwordResetService.resolveReset('abc')).rejects.toMatchObject({ status: 410, reason: 'superseded' });
  });

  it('rejects an expired token with 410/reason=expired', async () => {
    resetRepoMock.getByTokenHash.mockResolvedValue(existingReset({ expires_at: new Date(Date.now() - 1000).toISOString() }));
    await expect(passwordResetService.resolveReset('abc')).rejects.toMatchObject({ status: 410, reason: 'expired' });
  });

  it('resolves a valid token', async () => {
    await expect(passwordResetService.resolveReset('abc')).resolves.toEqual({ valid: true });
  });

  it('hashes the incoming token before looking it up (raw token never reaches the repository)', async () => {
    await passwordResetService.resolveReset('raw-token-value');
    expect(resetRepoMock.getByTokenHash).toHaveBeenCalledWith(sha256('raw-token-value'));
  });
});

// ── Confirm ───────────────────────────────────────────────────
describe('confirmReset', () => {
  it('rejects a password under 8 characters', async () => {
    await expect(passwordResetService.confirmReset('abc', 'short')).rejects.toMatchObject({ status: 400 });
    expect(resetRepoMock.confirmReset).not.toHaveBeenCalled();
  });

  it('rejects an expired/used/superseded token the same way resolveReset does', async () => {
    resetRepoMock.getByTokenHash.mockResolvedValue(existingReset({ used_at: new Date().toISOString() }));
    await expect(passwordResetService.confirmReset('abc', 'longenough1')).rejects.toMatchObject({ status: 410, reason: 'used' });
  });

  it('treats an account deactivated since the request as not-found, not a distinct error', async () => {
    userRepoMock.getUserById.mockResolvedValue({ ...ACTIVE_ACCOUNT, is_active: false });
    await expect(passwordResetService.confirmReset('abc', 'longenough1'))
      .rejects.toMatchObject({ status: 404, message: 'This reset link was not found.' });
    expect(resetRepoMock.confirmReset).not.toHaveBeenCalled();
  });

  it('treats an archived account the same way', async () => {
    userRepoMock.getUserById.mockResolvedValue({ ...ACTIVE_ACCOUNT, archived_at: new Date().toISOString() });
    await expect(passwordResetService.confirmReset('abc', 'longenough1'))
      .rejects.toMatchObject({ status: 404 });
    expect(resetRepoMock.confirmReset).not.toHaveBeenCalled();
  });

  it('hashes the new password and hands the repository the resolved reset/user ids', async () => {
    resetRepoMock.getByTokenHash.mockResolvedValue(existingReset({ id: 42, user_id: 7 }));
    userRepoMock.getUserById.mockResolvedValue({ id: 7, is_active: true, archived_at: null });

    await passwordResetService.confirmReset('abc', 'longenough1');

    expect(resetRepoMock.confirmReset).toHaveBeenCalledWith({
      resetId: 42,
      userId: 7,
      passwordHash: 'hashed:longenough1',
    });
  });

  it('returns success on a valid confirm', async () => {
    await expect(passwordResetService.confirmReset('abc', 'longenough1')).resolves.toEqual({ success: true });
  });
});
