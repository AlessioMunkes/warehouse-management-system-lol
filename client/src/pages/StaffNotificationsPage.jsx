// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffNotificationsPage.jsx
//
// Every floor notification this worker has received (new slips, slips
// released back), read and unread, newest first. Opened from "See all
// notifications" at the foot of the floor bell, not from the tab bar.
// Managers and admins have their own (NotificationsPage).
//
// The same screen as every worker history (HistoryScreen): search, Sort,
// filters, and one row per notification with Open where it leads
// somewhere. Opening one marks it read.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import notificationAPI from '../services/notificationAPI';
import {
  notificationDestination, notificationTypeLabel, timeAgo, announceNotificationsChanged,
} from '../features/notifications/notificationMatrix';
import HistoryScreen, { HistoryRow } from '../features/staff/HistoryScreen';
import { byNewest, byOldest } from '../features/staff/historyView';
import StatusBadge from '@/components/ui/status-badge';
import { STAFF } from '../routes/paths';

const ROLE = 'warehouse_worker';

const SORTS = [
  { key: 'newest', label: 'Newest first', compare: byNewest((n) => n.createdAt) },
  { key: 'oldest', label: 'Oldest first', compare: byOldest((n) => n.createdAt) },
];
const FILTERS = [
  { key: 'type', label: 'Type', valueOf: (n) => n.type, labelOf: notificationTypeLabel },
  { key: 'read', label: 'Status', valueOf: (n) => (n.isRead ? 'read' : 'unread'), labelOf: (v) => (v === 'read' ? 'Read' : 'Unread') },
];

export default function StaffNotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await notificationAPI.getFloorNotifications({ limit: 200 }));
    } catch (err) {
      setError(err.message || 'Could not load your notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async (n) => {
    if (!n.isRead) {
      setItems((all) => all.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      try { await notificationAPI.markFloorNotificationRead(n.id); announceNotificationsChanged(); } catch { /* the badge self-corrects */ }
    }
    const to = notificationDestination(n, ROLE);
    if (to) navigate(to);
  };

  const markAll = async () => {
    setItems((all) => all.map((n) => ({ ...n, isRead: true })));
    try { await notificationAPI.markAllFloorNotificationsRead(); announceNotificationsChanged(); } catch { load(); }
  };
  const unread = items.filter((n) => !n.isRead).length;

  return (
    <StaffShell crumb="Notifications" onBack={() => navigate(STAFF.home)}>
      <HistoryScreen
        title="Notifications"
        sub="Everything sent to you. Open one to go to it."
        error={error}
        loading={loading}
        rows={items}
        search={(n) => `${n.title} ${n.body}`}
        searchPlaceholder="Search notifications"
        searchId="stf-notifications-search"
        sorts={SORTS}
        filters={FILTERS}
        empty="No notifications yet. New slips and slips released back to the floor appear here."
        noun="notifications"
        renderRow={(n) => (
          <HistoryRow
            title={n.title}
            meta={[n.body, timeAgo(n.createdAt)].filter(Boolean).join(' · ')}
            badges={n.isRead ? null : <StatusBadge tone="info">Unread</StatusBadge>}
            action={notificationDestination(n, ROLE) ? { label: 'Open', onClick: () => open(n) } : null}
          />
        )}
      >
        {unread > 0 ? (
          <button type="button" className="stf-btn stf-btn-secondary" onClick={markAll}>Mark all read</button>
        ) : null}
      </HistoryScreen>
    </StaffShell>
  );
}
