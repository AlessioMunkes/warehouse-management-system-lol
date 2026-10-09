// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/NotificationBell.jsx
//
// The bell in the top bar for managers and admins. The unread count is
// checked every minute (the app has no live connection); the list is
// only fetched when the bell is opened. Clicking a notification marks it
// read and opens the screen where it can be dealt with (see
// notificationMatrix.js). Warehouse workers get StaffNotificationBell.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import notificationAPI from '../../services/notificationAPI';
import {
  notificationDestination, NOTIFICATIONS_CHANGED, announceNotificationsChanged,
} from './notificationMatrix';
import NotificationList from './NotificationList';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Bell } from 'lucide-react';

const POLL_MS = 60_000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth() ?? {};
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshCount = useCallback(() => {
    notificationAPI.getUnreadCount().then(setUnreadCount).catch(() => { /* a stale badge is not worth an error banner */ });
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    // Read somewhere else on the page (e.g. the dashboard widget).
    window.addEventListener(NOTIFICATIONS_CHANGED, refreshCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refreshCount);
    };
  }, [refreshCount]);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setItems(await notificationAPI.getNotifications());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenChange = (next) => {
    setOpen(next);
    if (next) loadList();
  };

  const markOneRead = async (id) => {
    setItems((all) => all.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await notificationAPI.markNotificationRead(id);
      refreshCount();
      announceNotificationsChanged();
    } catch {
      /* the badge will self-correct on the next check */
    }
  };

  const openNotification = async (notification) => {
    if (!notification.isRead) await markOneRead(notification.id);
    const destination = notificationDestination(notification, user?.role);
    if (destination) {
      setOpen(false);
      navigate(destination);
    }
  };

  const markAll = async () => {
    setItems((all) => all.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationAPI.markAllNotificationsRead();
      announceNotificationsChanged();
    } catch {
      refreshCount();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
          <Bell />
          {/* Keyed on the count so the pop-in plays again on each new arrival. */}
          {unreadCount > 0 ? (
            <span
              key={unreadCount}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-on-brand motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 ? (
              <span className="whitespace-nowrap rounded-full bg-brand px-1.5 py-px text-[11px] font-semibold text-on-brand">{unreadCount} new</span>
            ) : null}
          </div>
          {items.some((n) => !n.isRead) ? (
            <button type="button" onClick={markAll} className="whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-foreground">
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-[26rem] overflow-y-auto">
          <NotificationList items={items} role={user?.role} onOpen={openNotification} loading={loading} error={error} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
