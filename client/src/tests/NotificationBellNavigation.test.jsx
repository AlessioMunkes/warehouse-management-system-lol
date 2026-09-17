import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell, { notificationDestination } from '../features/notifications/components/NotificationBell';
import notificationAPI from '../services/notificationAPI';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('../services/notificationAPI', () => ({
  default: {
    getUnreadCount: vi.fn(),
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));

const renderBell = () => render(
  <MemoryRouter>
    <NotificationBell />
  </MemoryRouter>
);

const notification = (overrides) => ({
  id: 1,
  type: 'picking_slips_generated',
  title: 'Picking slips ready',
  body: '',
  entityId: null,
  createdAt: new Date().toISOString(),
  isRead: false,
  ...overrides,
});

describe('NotificationBell navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationAPI.getUnreadCount.mockResolvedValue(1);
    notificationAPI.markNotificationRead.mockResolvedValue(undefined);
    notificationAPI.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it('maps known notification destinations', () => {
    expect(notificationDestination(notification({ type: 'picking_slips_generated' }))).toBe('/noc/picking-slips');
    expect(notificationDestination(notification({ type: 'picking_slip_created', entityId: 42 }))).toBe('/noc/packing/42');
    expect(notificationDestination(notification({ type: 'non_collections_flagged' }))).toBe('/noc/beneficiaries');
    expect(notificationDestination(notification({ type: 'purchase_order_needs_attention' }))).toBe('/noc/purchase-orders');
    expect(notificationDestination(notification({ type: 'low_stock' }))).toBe('/noc/inventory?status=lowstock');
    expect(notificationDestination(notification({ type: 'donation_review' }))).toBe('/admin/donation-management');
    expect(notificationDestination(notification({ type: 'mystery' }))).toBeNull();
  });

  it('marks known notifications read and navigates', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([
      notification({ id: 7, type: 'picking_slip_created', entityId: 123, title: 'Slip created' }),
    ]);

    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await user.click(await screen.findByRole('button', { name: /slip created/i }));

    expect(notificationAPI.markNotificationRead).toHaveBeenCalledWith(7);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/noc/packing/123'));
  });

  it('marks unknown notifications read without navigating', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([
      notification({ id: 8, type: 'unknown_type', title: 'FYI' }),
    ]);

    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await user.click(await screen.findByRole('button', { name: /fyi/i }));

    expect(notificationAPI.markNotificationRead).toHaveBeenCalledWith(8);
    expect(navigate).not.toHaveBeenCalled();
  });
});
