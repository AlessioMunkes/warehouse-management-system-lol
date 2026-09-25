import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell, {
  notificationDestination,
  notificationSeverity,
} from '../features/notifications/components/NotificationBell';
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
    expect(notificationDestination(notification({ type: 'picking_slips_generated' }))).toBeNull();
    expect(notificationDestination(notification({ type: 'non_collections_flagged' }))).toBe('/noc/beneficiaries');
    expect(notificationDestination(notification({ type: 'purchase_order_needs_attention' }))).toBe('/noc/purchase-orders');
    expect(notificationDestination(notification({ type: 'purchase_order_needs_attention', entityId: 42 }))).toBe('/noc/purchase-orders?id=42');
    expect(notificationDestination(notification({ type: 'low_stock' }))).toBe('/noc/inventory?status=lowstock');
    expect(notificationDestination(notification({ type: 'donation_review' }))).toBe('/admin/donation-management');
    expect(notificationDestination(notification({ type: 'section18a_handoff_failed' }))).toBe('/admin/section-18a');
    expect(notificationDestination(notification({ type: 'vms_sync_failed' }))).toBe('/volunteers');
    expect(notificationDestination(notification({ type: 'stock_expiry_2_weeks' }))).toBeNull();
    expect(notificationDestination(notification({ type: 'stock_expiry_1_week' }))).toBeNull();
    expect(notificationDestination(notification({ type: 'mystery' }))).toBeNull();
  });

  it('maps notification severities', () => {
    expect(notificationSeverity(notification({ type: 'picking_slips_generated' }))).toBe('readOnly');
    expect(notificationSeverity(notification({ type: 'stock_expiry_2_weeks' }))).toBe('warning');
    expect(notificationSeverity(notification({ type: 'stock_expiry_1_week' }))).toBe('warning');
    expect(notificationSeverity(notification({ type: 'low_stock' }))).toBe('action');
    expect(notificationSeverity(notification({ type: 'non_collections_flagged' }))).toBe('action');
    expect(notificationSeverity(notification({ type: 'purchase_order_needs_attention' }))).toBe('action');
    expect(notificationSeverity(notification({ type: 'donation_review' }))).toBe('action');
    expect(notificationSeverity(notification({ type: 'section18a_handoff_failed' }))).toBe('action');
    expect(notificationSeverity(notification({ type: 'vms_sync_failed' }))).toBe('action');
  });

  it('marks known notifications read and navigates', async () => {
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

  it('marks read-only notifications read without navigating', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([
      notification({ id: 8, type: 'picking_slips_generated', title: 'Picking slips ready' }),
    ]);

    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await user.click(await screen.findByRole('button', { name: /picking slips ready/i }));

    expect(notificationAPI.markNotificationRead).toHaveBeenCalledWith(8);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a severity badge on every notification row', async () => {
    const user = userEvent.setup();
    notificationAPI.getNotifications.mockResolvedValue([
      notification({ id: 9, type: 'picking_slips_generated', title: 'Picking slips ready' }),
      notification({ id: 10, type: 'stock_expiry_1_week', title: 'Stock expiring' }),
      notification({ id: 11, type: 'low_stock', title: 'Low stock' }),
    ]);

    renderBell();

    await user.click(screen.getByRole('button', { name: /notifications/i }));

    expect(await screen.findByText('READ ONLY')).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText('ACTION REQUIRED')).toBeInTheDocument();
  });
});
