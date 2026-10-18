// ─────────────────────────────────────────────────────────────
// server/__tests__/account.service.test.js
//
// A signed-in person changing their own password or email from Profile
// (PATCH /api/me/password, /api/me/email). Both need the current
// password; neither may take an address another account already has.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  getCredentials: vi.fn(),
  findOtherUserWithEmail: vi.fn(),
  setPasswordHash: vi.fn(),
  setEmail: vi.fn(),
};
vi.mock('../src/repositories/account.repository.js', () => ({ default: repoMock }));
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(async (plain, hash) => hash === `hash:${plain}`),
    hash: vi.fn(async (plain) => `hash:${plain}`),
  },
}));

const { default: service } = await import('../src/services/account.service.js');

const ACCOUNT = { id: 7, password_hash: 'hash:old-password', email: 'me@lol.org', is_active: true };

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getCredentials.mockResolvedValue(ACCOUNT);
  repoMock.findOtherUserWithEmail.mockResolvedValue(null);
});

describe('changePassword', () => {
  it('saves the new password once the current one is right', async () => {
    await service.changePassword(7, { currentPassword: 'old-password', newPassword: 'new-password-1' });
    expect(repoMock.setPasswordHash).toHaveBeenCalledWith(7, 'hash:new-password-1');
  });

  it('refuses a wrong current password', async () => {
    await expect(service.changePassword(7, { currentPassword: 'guess', newPassword: 'new-password-1' }))
      .rejects.toMatchObject({ status: 403 });
    expect(repoMock.setPasswordHash).not.toHaveBeenCalled();
  });

  it('refuses a short password, a missing current one, and the same one again', async () => {
    await expect(service.changePassword(7, { currentPassword: 'old-password', newPassword: 'short' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.changePassword(7, { newPassword: 'new-password-1' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.changePassword(7, { currentPassword: 'old-password', newPassword: 'old-password' }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('changeEmail', () => {
  it('saves a new address in lower case', async () => {
    const out = await service.changeEmail(7, { currentPassword: 'old-password', email: ' New@LOL.org ' });
    expect(out).toEqual({ email: 'new@lol.org' });
    expect(repoMock.setEmail).toHaveBeenCalledWith(7, 'me@lol.org', 'new@lol.org');
  });

  it('refuses an address another account has, a bad address, and a wrong password', async () => {
    repoMock.findOtherUserWithEmail.mockResolvedValueOnce({ id: 9 });
    await expect(service.changeEmail(7, { currentPassword: 'old-password', email: 'taken@lol.org' }))
      .rejects.toMatchObject({ status: 409 });
    await expect(service.changeEmail(7, { currentPassword: 'old-password', email: 'not-an-email' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.changeEmail(7, { currentPassword: 'nope', email: 'new@lol.org' }))
      .rejects.toMatchObject({ status: 403 });
    expect(repoMock.setEmail).not.toHaveBeenCalled();
  });

  it('does nothing when the address is the one already on the account', async () => {
    await service.changeEmail(7, { currentPassword: 'old-password', email: 'ME@lol.org' });
    expect(repoMock.setEmail).not.toHaveBeenCalled();
  });
});
