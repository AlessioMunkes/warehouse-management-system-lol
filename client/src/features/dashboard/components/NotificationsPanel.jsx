// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/components/NotificationsPanel.jsx
//
// The "Notifications" dashboard widget for managers and admins: the
// latest notifications in the same list as the bell. Clicking one marks
// it read and opens its screen. It refreshes when the bell (or another
// copy of this widget) marks something read, and once a minute.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import notificationAPI from '../../../services/notificationAPI';
import NotificationList from '../../notifications/components/NotificationList';
import {
  notificationDestination, NOTIFICATIONS_CHANGED, announceNotificationsChanged,
} from '../../notifications/notificationMatrix';
import { useAuth } from '../../../context/AuthContext';

const SHOWN = 6;
const REFRESH_MS = 60_000;

export default function NotificationsPanel() {
  const navigate = useNavigate();
  const { user } = useAuth() ?? {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    notificationAPI.getNotifications()
      .then((rows) => { setItems(rows); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [load]);

  const open = async (n) => {
    if (!n.isRead) {
      setItems((all) => all.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      try { await notificationAPI.markNotificationRead(n.id); announceNotificationsChanged(); } catch { /* next refresh corrects it */ }
    }
    const destination = notificationDestination(n, user?.role);
    if (destination) navigate(destination);
  };

  const markAll = async () => {
    setItems((all) => all.map((n) => ({ ...n, isRead: true })));
    try { await notificationAPI.markAllNotificationsRead(); announceNotificationsChanged(); } catch { load(); }
  };

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="-mx-1 flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-xs text-muted-foreground">
          {unread ? `${unread} new` : items.length ? 'Nothing new' : ''}
        </span>
        {unread ? (
          <button type="button" onClick={markAll} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Mark all read
          </button>
        ) : null}
      </div>
      <div className="max-h-80 flex-1 overflow-y-auto rounded-lg border">
        <NotificationList
          items={items} role={user?.role} onOpen={open}
          loading={loading} error={error} limit={showAll ? null : SHOWN}
        />
      </div>
      {items.length > SHOWN ? (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-2 self-start px-1 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      ) : null}
    </div>
  );
}
