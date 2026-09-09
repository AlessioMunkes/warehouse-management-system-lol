// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/components/NotificationBell.jsx
//
// Polls the unread count every 60s rather than opening a socket —
// this app has no realtime transport anywhere else (reporting's own
// CACHE_TTL.LIVE is the same one-minute figure, for the same reason:
// Render's free tier sleeps, so anything fancier than a plain
// interval would need to survive a cold wake anyway).
//
// The list itself is only fetched when the popover opens, not on
// every poll tick — the unread count is cheap and worth staying
// current, the full list is not something worth re-fetching in the
// background while nobody is looking at it.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import notificationAPI from '../../../services/notificationAPI';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Bell } from 'lucide-react';

const timeAgo = (iso) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const POLL_MS = 60_000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshCount = useCallback(() => {
    notificationAPI.getUnreadCount().then(setUnreadCount).catch(() => { /* silent — a stale badge is not worth an error banner */ });
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
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
    } catch {
      /* the badge will self-correct on the next poll tick */
    }
  };

  const markAll = async () => {
    setItems((all) => all.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationAPI.markAllNotificationsRead();
    } catch {
      refreshCount();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {unreadCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef3a40] px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {items.some((n) => !n.isRead) ? (
            <button type="button" onClick={markAll} className="text-xs text-muted-foreground underline">
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="p-4 text-sm text-muted-foreground">{error}</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.isRead && markOneRead(n.id)}
                className={`block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50 ${n.isRead ? '' : 'bg-muted/30'}`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ef3a40]" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body ? <p className="text-xs text-muted-foreground">{n.body}</p> : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
