// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffNotificationBell.jsx
//
// The warehouse worker's bell. Same look and behaviour as the manager
// bell (NotificationBell), but it reads the floor feed (new picking
// slips only) and slides in from the side, which suits a phone.
// Clicking a notification marks it read and opens the pallet, or the
// packing board for a whole new batch. The top of the panel is where a
// worker turns on alerts for their phone (PhoneAlerts).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import notificationAPI from '../../services/notificationAPI';
import NotificationList from '../../features/notifications/components/NotificationList';
import { notificationDestination, NOTIFICATIONS_CHANGED } from '../../features/notifications/notificationMatrix';
import PhoneAlerts from '../../features/notifications/components/PhoneAlerts';

const POLL_MS = 60_000;
const ROLE = 'warehouse_worker';

export default function StaffNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshCount = useCallback(() => {
    notificationAPI.getFloorUnreadCount().then(setUnreadCount).catch(() => { /* a stale badge is not worth an error banner */ });
  }, []);

  // Polls, and refreshes at once when a phone alert arrives
  // (usePushMessages announces it).
  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, refreshCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refreshCount);
    };
  }, [refreshCount]);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setItems(await notificationAPI.getFloorNotifications());
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
      await notificationAPI.markFloorNotificationRead(id);
      refreshCount();
    } catch {
      /* the badge will self-correct on the next check */
    }
  };

  const openNotification = async (notification) => {
    if (!notification.isRead) await markOneRead(notification.id);
    const destination = notificationDestination(notification, ROLE);
    if (destination) {
      setOpen(false);
      navigate(destination);
    }
  };

  const markAll = async () => {
    setItems((all) => all.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationAPI.markAllFloorNotificationsRead();
    } catch {
      refreshCount();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
          <Bell />
          {unreadCount > 0 ? (
            <span
              key={unreadCount}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-on-brand motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[22rem] max-w-[90vw] gap-0 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2 pr-8">
            <div className="flex items-center gap-2">
              <SheetTitle>Notifications</SheetTitle>
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
        </SheetHeader>
        <PhoneAlerts />
        <div className="flex-1 overflow-y-auto">
          <NotificationList items={items} role={ROLE} onOpen={openNotification} loading={loading} error={error} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
