// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffNotificationBell.jsx
//
// The worker-facing twin of NotificationBell (manager side). Same
// polling shape, same /api/notifications envelope, but reads the
// /floor routes — server-narrowed to picking-slip events, never a
// manager's PO/BR-14 chatter (see notification.routes.js's header
// comment) — and opens as a slide-in Sheet rather than a Popover.
// StaffShell already reaches for Sheet for AppNavDrawer's own overlay,
// so this follows the same proven pattern for a staff-phone screen
// instead of introducing a new one.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import notificationAPI from '../../services/notificationAPI';

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

export default function StaffNotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshCount = useCallback(() => {
    notificationAPI.getFloorUnreadCount().then(setUnreadCount).catch(() => { /* silent — a stale badge is not worth an error banner */ });
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
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
      /* the badge will self-correct on the next poll tick */
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
        <Button type="button" variant="ghost" size="icon" className="relative" aria-label="Notifications">
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
      <SheetContent side="right" className="w-80 max-w-[85vw] p-0">
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Notifications</SheetTitle>
            {items.some((n) => !n.isRead) ? (
              <button type="button" onClick={markAll} className="text-xs text-muted-foreground underline">
                Mark all read
              </button>
            ) : null}
          </div>
        </SheetHeader>
        <div className="max-h-[70vh] overflow-y-auto">
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
                className={`block w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50 ${n.isRead ? '' : 'bg-muted/30'}`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />}
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
      </SheetContent>
    </Sheet>
  );
}
