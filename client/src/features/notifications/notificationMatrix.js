// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/notificationMatrix.js
//
// What each notification type means: its icon, how urgent it is, and
// where clicking it takes you. Every type opens the screen where it can
// be dealt with, opened at the record itself when the notification
// names one (a slip, an order). Where that screen differs by role, the
// destination takes the reader's role: a new slip opens the Picking
// Slips page for a manager but the pallet itself for a worker.
//
// Its own module so the bell components only export components
// (react-refresh's rule). The bells, the dashboard widget and the tests
// all read from here.
// ─────────────────────────────────────────────────────────────
import {
  AlertTriangle, ClipboardList, Clock, Gift, Mail, Package, ShoppingCart, Truck, Users, Bell,
} from 'lucide-react';
import { STAFF, ADMIN, PACKING, VOLUNTEERS } from '../../routes/paths';

const isWorker = (role) => role === 'warehouse_worker';
const withOpen = (path, id, param = 'open') => (id ? `${path}?${param}=${encodeURIComponent(id)}` : path);

// A generated run names its dispatch date in the body ("tuesday, 2026-10-01").
const dateIn = (text) => String(text ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

// severity: 'action' (needs someone), 'warning' (keep an eye on it),
// 'info' (for your information).
const NOTIFICATION_MATRIX = {
  low_stock: {
    severity: 'action', icon: AlertTriangle,
    destination: () => '/noc/inventory?status=lowstock',
  },
  picking_slips_generated: {
    severity: 'info', icon: ClipboardList,
    destination: (n, role) => {
      if (isWorker(role)) return PACKING.board;
      const date = dateIn(n.body);
      return date ? `${STAFF.pickingSlips}?date=${date}` : STAFF.pickingSlips;
    },
  },
  picking_slip_created: {
    severity: 'info', icon: Package,
    destination: (n, role) => (isWorker(role)
      ? (n.entityId ? PACKING.detail(n.entityId) : PACKING.board)
      : withOpen(STAFF.pickingSlips, n.entityId)),
  },
  // A manager released a claimed pallet back to the floor (workers only).
  picking_slip_released: {
    severity: 'info', icon: Package,
    destination: (n, role) => (isWorker(role)
      ? (n.entityId ? PACKING.detail(n.entityId) : PACKING.board)
      : withOpen(STAFF.pickingSlips, n.entityId)),
  },
  non_collections_flagged: {
    severity: 'action', icon: Truck,
    destination: () => STAFF.dispatchHistory,
  },
  purchase_order_needs_attention: {
    severity: 'action', icon: ShoppingCart,
    destination: (n) => withOpen(STAFF.purchaseOrders, n.entityId, 'id'),
  },
  vms_sync_failed: {
    severity: 'action', icon: Users,
    destination: () => VOLUNTEERS.events,
  },
  stock_expiry_warning_2w: {
    severity: 'warning', icon: Clock,
    destination: () => '/noc/inventory',
  },
  stock_expiry_warning_1w: {
    severity: 'warning', icon: Clock,
    destination: () => '/noc/inventory',
  },
  donation_review: {
    severity: 'action', icon: Gift,
    destination: () => ADMIN.donationManagement,
  },
  section18a_email_failed: {
    severity: 'action', icon: Mail,
    destination: () => ADMIN.section18aManagement,
  },
};
// Older names still stored on some rows.
NOTIFICATION_MATRIX.stock_expiry_2_weeks = NOTIFICATION_MATRIX.stock_expiry_warning_2w;
NOTIFICATION_MATRIX.stock_expiry_1_week = NOTIFICATION_MATRIX.stock_expiry_warning_1w;
NOTIFICATION_MATRIX.section18a_handoff_failed = NOTIFICATION_MATRIX.section18a_email_failed;

export const notificationSeverity = (notification) => (
  NOTIFICATION_MATRIX[notification?.type]?.severity ?? 'info'
);

export const notificationIcon = (notification) => (
  NOTIFICATION_MATRIX[notification?.type]?.icon ?? Bell
);

/** Where clicking it goes for this role, or null if nowhere. */
export const notificationDestination = (notification, role = null) => {
  const entry = NOTIFICATION_MATRIX[notification?.type];
  return entry ? entry.destination(notification, role) : null;
};

// "5m ago" beats a timestamp in a list someone glances at.
export const timeAgo = (iso) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

// Tells every bell and widget on the page that read state changed, so a
// badge updates straight away instead of on its next poll.
export const NOTIFICATIONS_CHANGED = 'notifications:changed';
export const announceNotificationsChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
};
