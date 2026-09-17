// ─────────────────────────────────────────────────────────────
// server/__tests__/notification.service.test.js
//
// notification.repository.js is mocked, so this covers only the
// service's own logic: reads and writes are scoped to the calling
// user's id, and markRead validates its id param.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listForUser:   vi.fn(),
  getUnreadCount: vi.fn(),
  markRead:      vi.fn(),
  markAllRead:   vi.fn(),
};

vi.mock('../src/repositories/notification.repository.js', () => ({ default: repoMock }));

const { default: notificationService } = await import('../src/services/notification.service.js');

const USER = { id: 7, role: 'manager' };

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.listForUser.mockResolvedValue([]);
  repoMock.getUnreadCount.mockResolvedValue(0);
});

describe('listNotifications', () => {
  it('scopes the read to the calling user\'s id', async () => {
    await notificationService.listNotifications(USER, {});
    expect(repoMock.listForUser).toHaveBeenCalledWith(USER.id, { unreadOnly: false });
  });

  it('treats the string "true" from a query param as true', async () => {
    await notificationService.listNotifications(USER, { unreadOnly: 'true' });
    expect(repoMock.listForUser).toHaveBeenCalledWith(USER.id, { unreadOnly: true });
  });
});

describe('getUnreadCount', () => {
  it('scopes the read to the calling user\'s id', async () => {
    await notificationService.getUnreadCount(USER);
    expect(repoMock.getUnreadCount).toHaveBeenCalledWith(USER.id);
  });
});

describe('markRead', () => {
  it('rejects a non-numeric id', async () => {
    await expect(notificationService.markRead(USER, 'abc')).rejects.toMatchObject({ status: 400 });
    expect(repoMock.markRead).not.toHaveBeenCalled();
  });

  it('marks read for the calling user only', async () => {
    await notificationService.markRead(USER, 12);
    expect(repoMock.markRead).toHaveBeenCalledWith(12, USER.id);
  });
});

describe('markAllRead', () => {
  it('scopes the write to the calling user\'s id', async () => {
    await notificationService.markAllRead(USER);
    expect(repoMock.markAllRead).toHaveBeenCalledWith(USER.id);
  });
});
