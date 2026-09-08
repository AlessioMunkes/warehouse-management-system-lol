// ─────────────────────────────────────────────────────────────
// server/__tests__/user.service.test.js
//
// user.repository.js is mocked, so these tests exercise the
// service's own rules: validation, the self-lockout guard (an admin
// cannot deactivate their own account or demote themselves out of
// admin), and that role/status changes only touch what was actually
// supplied.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn(async (pw) => `hashed:${pw}`) },
}));

const repoMock = {
  listUsers:         vi.fn(),
  getUserById:       vi.fn(),
  findUserByUsername: vi.fn(),
  insertUser:        vi.fn(),
  updateUser:        vi.fn(),
  setUserActive:     vi.fn(),
};

vi.mock('../src/repositories/user.repository.js', () => ({ default: repoMock }));

const { default: userService } = await import('../src/services/user.service.js');

const ADMIN_ID  = 1;
const OTHER_ID  = 2;

const existingUser = (over = {}) => ({
  id: OTHER_ID, username: 'jdoe', first_name: 'Jane', last_name: 'Doe',
  role: 'warehouse_worker', is_active: true, ...over,
});

const body = (over = {}) => ({
  username: 'jdoe', firstName: 'Jane', lastName: 'Doe',
  role: 'warehouse_worker', password: 'longenough1', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findUserByUsername.mockResolvedValue(null);
  repoMock.getUserById.mockResolvedValue(existingUser());
  repoMock.insertUser.mockResolvedValue({ id: 900, ...existingUser() });
  repoMock.updateUser.mockResolvedValue(existingUser());
  repoMock.setUserActive.mockResolvedValue(existingUser());
});

describe('listUsers', () => {
  it('treats the string "true" from a query param as true', async () => {
    repoMock.listUsers.mockResolvedValue([]);
    await userService.listUsers({ includeInactive: 'true', search: '' });
    expect(repoMock.listUsers).toHaveBeenCalledWith({ includeInactive: true, search: null });
  });

  it('defaults to excluding inactive users and no search filter', async () => {
    repoMock.listUsers.mockResolvedValue([]);
    await userService.listUsers({});
    expect(repoMock.listUsers).toHaveBeenCalledWith({ includeInactive: false, search: null });
  });
});

describe('getUser', () => {
  it('rejects a non-numeric id', async () => {
    await expect(userService.getUser('abc')).rejects.toMatchObject({ status: 400 });
  });

  it('404s when the repository finds nothing', async () => {
    repoMock.getUserById.mockResolvedValue(null);
    await expect(userService.getUser(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('createUser — validation', () => {
  it('requires a username', async () => {
    await expect(userService.createUser(body({ username: '  ' }), ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires a first name', async () => {
    await expect(userService.createUser(body({ firstName: '' }), ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires a last name', async () => {
    await expect(userService.createUser(body({ lastName: '' }), ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a role outside the live CHECK constraint', async () => {
    await expect(userService.createUser(body({ role: 'guest' }), ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a password under 8 characters', async () => {
    await expect(userService.createUser(body({ password: 'short' }), ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('409s on a username that already exists', async () => {
    repoMock.findUserByUsername.mockResolvedValue(existingUser({ is_active: true }));
    await expect(userService.createUser(body(), ADMIN_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('notes when the clashing username belongs to an inactive account', async () => {
    repoMock.findUserByUsername.mockResolvedValue(existingUser({ is_active: false }));
    await expect(userService.createUser(body(), ADMIN_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('currently inactive') });
  });

  it('hashes the password before handing it to the repository, never the plaintext', async () => {
    await userService.createUser(body({ password: 'longenough1' }), ADMIN_ID);
    const call = repoMock.insertUser.mock.calls[0][0];
    expect(call.passwordHash).toBe('hashed:longenough1');
    expect(call.password).toBeUndefined();
  });

  it('passes the actor id through for the audit trail', async () => {
    await userService.createUser(body(), ADMIN_ID);
    expect(repoMock.insertUser).toHaveBeenCalledWith(expect.anything(), ADMIN_ID);
  });
});

describe('updateUser — partial patch semantics', () => {
  it('404s when the target user does not exist', async () => {
    repoMock.getUserById.mockResolvedValue(null);
    await expect(userService.updateUser(OTHER_ID, { firstName: 'X' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  it('rejects an empty patch rather than writing nothing', async () => {
    await expect(userService.updateUser(OTHER_ID, {}, ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('only sends fields actually present in the body', async () => {
    await userService.updateUser(OTHER_ID, { firstName: 'Janet' }, ADMIN_ID);
    const patch = repoMock.updateUser.mock.calls[0][1];
    expect(patch).toEqual({ firstName: 'Janet' });
  });

  it('409s when renaming into a username someone else already has', async () => {
    repoMock.findUserByUsername.mockResolvedValue(existingUser({ id: 999 }));
    await expect(userService.updateUser(OTHER_ID, { username: 'taken' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 409 });
  });

  it('excludes the user\'s own row when checking for a username clash', async () => {
    await userService.updateUser(OTHER_ID, { username: 'jdoe' }, ADMIN_ID);
    expect(repoMock.findUserByUsername).toHaveBeenCalledWith('jdoe', { excludeId: OTHER_ID });
  });

  // ── Self-lockout guard (b) ───────────────────────────────────
  it('blocks an admin from demoting themselves out of admin', async () => {
    repoMock.getUserById.mockResolvedValue(existingUser({ id: ADMIN_ID, role: 'admin' }));
    await expect(userService.updateUser(ADMIN_ID, { role: 'manager' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.updateUser).not.toHaveBeenCalled();
  });

  it('lets an admin change ANOTHER admin\'s role away from admin', async () => {
    repoMock.getUserById.mockResolvedValue(existingUser({ id: OTHER_ID, role: 'admin' }));
    await userService.updateUser(OTHER_ID, { role: 'manager' }, ADMIN_ID);
    expect(repoMock.updateUser).toHaveBeenCalled();
  });

  it('lets an admin keep their own role as admin (a no-op change is not a demotion)', async () => {
    repoMock.getUserById.mockResolvedValue(existingUser({ id: ADMIN_ID, role: 'admin' }));
    await userService.updateUser(ADMIN_ID, { role: 'admin' }, ADMIN_ID);
    expect(repoMock.updateUser).toHaveBeenCalled();
  });
});

describe('setUserStatus', () => {
  it('requires isActive to be a boolean', async () => {
    await expect(userService.setUserStatus(OTHER_ID, { isActive: 'yes' }, ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  // ── Self-lockout guard (a) ───────────────────────────────────
  it('blocks an admin from deactivating their own account', async () => {
    await expect(userService.setUserStatus(ADMIN_ID, { isActive: false }, ADMIN_ID))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.setUserActive).not.toHaveBeenCalled();
  });

  it('lets an admin reactivate their own account (only deactivation is blocked)', async () => {
    repoMock.getUserById.mockResolvedValue(existingUser({ id: ADMIN_ID, is_active: false }));
    await userService.setUserStatus(ADMIN_ID, { isActive: true }, ADMIN_ID);
    expect(repoMock.setUserActive).toHaveBeenCalled();
  });

  it('404s when the target user does not exist', async () => {
    repoMock.getUserById.mockResolvedValue(null);
    await expect(userService.setUserStatus(OTHER_ID, { isActive: false }, ADMIN_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  it('is a no-op (no write) when the status already matches', async () => {
    repoMock.getUserById.mockResolvedValue(existingUser({ is_active: false }));
    const result = await userService.setUserStatus(OTHER_ID, { isActive: false }, ADMIN_ID);
    expect(repoMock.setUserActive).not.toHaveBeenCalled();
    expect(result.is_active).toBe(false);
  });
});
