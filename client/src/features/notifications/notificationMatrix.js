// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/notificationMatrix.js
//
// What each notification type means: how severe it is and where
// clicking it takes you. Its own module so NotificationBell.jsx
// exports only its component (react-refresh's rule); the bell and
// its tests both read from here.
// ─────────────────────────────────────────────────────────────
const NOTIFICATION_MATRIX = {
  low_stock: {
    severity: 'action',
    destination: () => '/noc/inventory?status=lowstock',
  },
  picking_slips_generated: {
    severity: 'readOnly',
    destination: () => null,
  },
  non_collections_flagged: {
    severity: 'action',
    destination: () => '/noc/beneficiaries',
  },
  purchase_order_needs_attention: {
    severity: 'action',
    destination: (notification) => (
      notification.entityId
        ? `/noc/purchase-orders?id=${encodeURIComponent(notification.entityId)}`
        : '/noc/purchase-orders'
    ),
  },
  vms_sync_failed: {
    severity: 'action',
    destination: () => '/volunteers',
  },
  stock_expiry_2_weeks: {
    severity: 'warning',
    destination: () => null,
  },
  stock_expiry_1_week: {
    severity: 'warning',
    destination: () => null,
  },
  donation_review: {
    severity: 'action',
    destination: () => '/admin/donation-management',
  },
  section18a_handoff_failed: {
    severity: 'action',
    destination: () => '/admin/section-18a',
  },
};

export const notificationSeverity = (notification) => (
  NOTIFICATION_MATRIX[notification?.type]?.severity ?? 'readOnly'
);

export const notificationDestination = (notification) => {
  const matrixEntry = NOTIFICATION_MATRIX[notification?.type];
  if (!matrixEntry || matrixEntry.severity !== 'action') return null;
  return matrixEntry.destination(notification);
};
