// Notifications: every type opens the screen where it can be dealt
// with, for the reader's role, and the list shows how urgent each one is.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from '../features/notifications/NotificationBell';
import {
  notificationDestination,
  notificationSeverity,
} from '../features/notifications/notificationMatrix';
import notificationAPI from '../services/notificationAPI';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 2, role: 'manager' } }),
}));

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

describe('where each notification goes', () => {
  it('opens the record itself when the notification names one', () => {
    expect(notificationDestination(notification({ type: 'purchase_order_needs_attention', entityId: 42 }), 'manager')).toBe('/noc/purchase-orders?id=42');
    expect(notificationDestination(notification({ type: 'purchase_order_needs_attention' }), 'manager')).toBe('/noc/purchase-orders');
    expect(notificationDestination(notification({ type: 'picking_slip_created', entityId: 9 }), 'manager')).toBe('/noc/picking-slips?open=9');
  });

  it('sends a worker to the pallet, and a manager to the slip list', () => {
    const created = notification({ type: 'picking_slip_created', entityId: 9 });
    expect(notificationDestination(created, 'warehouse_worker')).toBe('/noc/packing/9');
    expect(notificationDestination(notification({ type: 'picking_slips_generated' }), 'warehouse_worker')).toBe('/noc/packing');
    const released = notification({ type: 'picking_slip_released', entityId: 4 });
    expect(notificationDestination(released, 'warehouse_worker')).toBe('/noc/packing/4');
    expect(notificationDestination(notification({ type: 'picking_slips_generated', body: 'tuesday, 2026-10-01 · 96 slips' }), 'manager'))
      .toBe('/noc/picking-slips?date=2026-10-01');
  });

  it('gives every type the server sends somewhere to go', () => {
    const cases = [
      ['low_stock', 'manager', '/noc/inventory?status=lowstock'],
      ['non_collections_flagged', 'manager', '/noc/picking-slips?status=notcollected'],
      ['non_collections_flagged', 'warehouse_worker', '/staff/dispatch/history'],
      ['stock_expiry_warning_2w', 'manager', '/noc/inventory'],
      ['stock_expiry_warning_1w', 'manager', '/noc/inventory'],
      ['donation_review', 'admin', '/admin/donation-management'],
      ['donation_review', 'manager', '/admin/donation-management'],
      ['section18a_email_failed', 'admin', '/admin/section-18a'],
      ['section18a_email_failed', 'manager', '/admin/section-18a'],
      ['vms_sync_failed', 'manager', '/volunteers'],
      // Older names still stored on some rows.
      ['stock_expiry_2_weeks', 'manager', '/noc/inventory'],
      ['section18a_handoff_failed', 'admin', '/admin/section-18a'],
    ];
    for (const [type, role, path] of cases) {
      expect(notificationDestination(notification({ type }), role), `${type} / ${role}`).toBe(path);
    }
    expect(notificationDestination(notification({ type: 'mystery' }), 'manager')).toBeNull();
  });

  // Each role sees only its own screens, so a notification never opens
  // another role's: it goes nowhere rather than bounce them home.
  it('never sends anyone to a screen of another role', () => {
    expect(notificationDestination(notification({ type: 'low_stock' }), 'warehouse_worker')).toBeNull();
    expect(notificationDestination(notification({ type: 'section18a_email_failed' }), 'warehouse_worker')).toBeNull();
    // An admin does not open a manager's screens either.
    expect(notificationDestination(notification({ type: 'non_collections_flagged' }), 'admin')).toBeNull();
    expect(notificationDestination(notification({ type: 'non_collections_flagged' }), 'manager'))
      .toBe('/noc/picking-slips?status=notcollected');
    expect(notificationDestination(notification({ type: 'donation_review' }), 'admin')).toBe('/admin/donation-management');
  });

  it('knows how urgent each type is', () => {
    expect(notificationSeverity(notification({ type: 'picking_slips_generated' }))).toBe('info');
    expect(notificationSeverity(notification({ type: 'stock_expiry_warning_1w' }))).toBe('warning');
    expect(notificationSeverity(notification({ type: 'low_stock' }))).toBe('action');
    expect(notificationSeverity(notification({ type: 'purchase_order_needs_attention' }))).toBe('action');
    expect(notificationSeverity(notification({ type: 'mystery' }))).toBe('info');
  });
});

describe('the bell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationAPI.getUnreadCount.mockResolvedValue(1);
    notificationAPI.markNotificationRead.mockResolvedValue(undefined);
    notificationAPI.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it('marks a notification read and opens its screen', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([
      notification({ id: 7, type: 'purchase_order_needs_attention', entityId: 123, title: 'PO needs attention' }),
    ]);
    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await user.click(await screen.findByRole('button', { name: /po needs attention/i }));

    expect(notificationAPI.markNotificationRead).toHaveBeenCalledWith(7);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/noc/purchase-orders?id=123'));
  });

  it('opens informational notifications too', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([
      notification({ id: 8, type: 'picking_slips_generated', title: 'Picking slips ready', body: 'thursday, 2026-10-02' }),
    ]);
    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await user.click(await screen.findByRole('button', { name: /picking slips ready/i }));

    expect(notificationAPI.markNotificationRead).toHaveBeenCalledWith(8);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/noc/picking-slips?date=2026-10-02'));
  });

  it('groups new and earlier items and flags the ones that need action', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([
      notification({ id: 9, type: 'low_stock', title: 'Low stock' }),
      notification({ id: 10, type: 'picking_slips_generated', title: 'Old news', isRead: true }),
    ]);
    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));

    expect(await screen.findByText('New')).toBeInTheDocument();
    expect(screen.getByText('Earlier')).toBeInTheDocument();
    expect(screen.getByText('Needs action')).toBeInTheDocument();
  });

  it('says so when there is nothing', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([]);
    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });
});
