// ─────────────────────────────────────────────────────────────
// src/tests/NotificationsPage.test.jsx
//
// Every notification a person has received, on its own page, opened
// from "See all notifications" at the foot of the bell. Managers and
// admins have one page, warehouse staff another.
// ─────────────────────────────────────────────────────────────
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 2, role: 'manager' } }),
}));
vi.mock('../components/layout/StaffShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../services/notificationAPI', () => ({
  default: {
    getUnreadCount: vi.fn(),
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    getFloorNotifications: vi.fn(),
    markFloorNotificationRead: vi.fn(),
    markAllFloorNotificationsRead: vi.fn(),
  },
}));

const { default: api } = await import('../services/notificationAPI');
const { default: NotificationsPage } = await import('../pages/NotificationsPage');
const { default: StaffNotificationsPage } = await import('../pages/StaffNotificationsPage');
const { default: NotificationBell } = await import('../features/notifications/NotificationBell');

const note = (id, over = {}) => ({
  id, type: 'purchase_order_needs_attention', title: `Order ${id} needs attention`, body: 'Delivered short',
  entityId: id, createdAt: new Date(Date.now() - id * 60000).toISOString(), isRead: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getUnreadCount.mockResolvedValue(1);
  api.markNotificationRead.mockResolvedValue();
  api.markAllNotificationsRead.mockResolvedValue();
});

describe('the bell', () => {
  it('ends with a link to every notification', async () => {
    api.getNotifications.mockResolvedValue([note(1)]);
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(await screen.findByRole('link', { name: 'See all notifications' })).toHaveAttribute('href', '/noc/notifications');
  });
});

describe('Notifications (managers and admins)', () => {
  it('lists read and unread, with an Unread tab and a type filter', async () => {
    api.getNotifications.mockResolvedValue([
      note(1),
      note(2, { isRead: true, type: 'low_stock', title: 'Rice is low', entityId: null }),
    ]);
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(await screen.findByText('Order 1 needs attention')).toBeInTheDocument();
    expect(screen.getByText('Rice is low')).toBeInTheDocument();
    expect(api.getNotifications).toHaveBeenCalledWith({ limit: 100 });
    expect(screen.getByRole('tab', { name: /Unread/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Unread/ }));
    await waitFor(() => expect(screen.queryByText('Rice is low')).not.toBeInTheDocument());
  });

  it('opening one marks it read and goes where the bell would', async () => {
    api.getNotifications.mockResolvedValue([note(42)]);
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await userEvent.click(await screen.findByText('Order 42 needs attention'));
    expect(api.markNotificationRead).toHaveBeenCalledWith(42);
    expect(navigate).toHaveBeenCalledWith('/noc/purchase-orders?id=42');
  });

  it('marks everything read', async () => {
    api.getNotifications.mockResolvedValue([note(1)]);
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Mark all read/ }));
    expect(api.markAllNotificationsRead).toHaveBeenCalled();
  });
});

describe('Notifications (warehouse staff)', () => {
  it('lists the floor feed and opens a slip', async () => {
    api.getFloorNotifications.mockResolvedValue([
      { ...note(9), type: 'picking_slip_created', title: 'New slip: Little Stars', body: '', entityId: 9 },
    ]);
    api.markFloorNotificationRead.mockResolvedValue();
    render(<MemoryRouter><StaffNotificationsPage /></MemoryRouter>);
    const row = (await screen.findByText('New slip: Little Stars')).closest('.stf-row');
    expect(within(row).getByText('Unread')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Open' }));
    expect(api.markFloorNotificationRead).toHaveBeenCalledWith(9);
    expect(navigate).toHaveBeenCalledWith('/noc/packing/9');
  });
});
