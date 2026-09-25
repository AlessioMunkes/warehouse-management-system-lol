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
import { useNavigate } from 'react-router-dom';
import notificationAPI from '../../../services/notificationAPI';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const SEVERITY_BADGE = {
  readOnly: {
    label: 'READ ONLY',
    className: 'bg-good-soft text-good hover:bg-good-soft',
  },
  warning: {
    label: 'WARNING',
    className: 'bg-warn-soft text-warn hover:bg-warn-soft',
  },
  action: {
    label: 'ACTION REQUIRED',
    className: 'bg-danger-soft text-danger hover:bg-danger-soft',
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

export default function NotificationBell() {
  const navigate = useNavigate();
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

  const openNotification = async (notification) => {
    if (!notification.isRead) await markOneRead(notification.id);
    const destination = notificationDestination(notification);
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
    } catch {
      refreshCount();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {/* key={unreadCount} remounts this span every time the count
              changes, which is what re-triggers the animation on a new
              arrival rather than only on the badge's very first
              appearance. Same animate-in/zoom-in-95 utilities (tw-
              animate-css, already a dependency) the dialog/alert-dialog
              primitives use for their own open transition. motion-safe:
              rather than the data-open/data-closed pattern those
              components use: there's no open/closed state here, just
              "did the count just change", so the animation runs once on
              mount and Tailwind's reduced-motion variant is the gate. */}
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
                onClick={() => openNotification(n)}
                className={`block w-full border-b px-3 py-2 text-left last:border-b-0 ${notificationDestination(n) ? 'hover:bg-muted/50' : 'cursor-default'} ${n.isRead ? '' : 'bg-muted/30'}`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{n.title}</p>
                      <Badge className={SEVERITY_BADGE[notificationSeverity(n)].className}>
                        {SEVERITY_BADGE[notificationSeverity(n)].label}
                      </Badge>
                    </div>
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
