// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/components/NotificationList.jsx
//
// The list of notifications, shared by the manager/admin bell, the
// floor bell and the dashboard widget, so they all look and behave the
// same. Unread items are grouped under "New". Each item shows an icon in
// a circle coloured by how urgent it is (red: needs action, amber:
// warning, grey: for information), and an arrow when clicking it opens
// a screen.
// ─────────────────────────────────────────────────────────────
import { createElement } from 'react';
import { BellOff, ChevronRight } from 'lucide-react';
import {
  notificationDestination, notificationIcon, notificationSeverity, timeAgo,
} from '../notificationMatrix';

const TONE = {
  action:  'bg-danger-soft text-danger',
  warning: 'bg-warn-soft text-warn',
  info:    'bg-muted text-muted-foreground',
};

function NotificationItem({ n, role, onOpen }) {
  const severity = notificationSeverity(n);
  const goes = Boolean(notificationDestination(n, role));
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none ${n.isRead ? '' : 'bg-muted/25'}`}
      >
        <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${TONE[severity]}`} aria-hidden="true">
          {createElement(notificationIcon(n), { className: 'size-4' })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className={`flex-1 text-sm leading-snug ${n.isRead ? 'text-foreground/80' : 'font-semibold text-foreground'}`}>
              {n.title}
            </span>
            {!n.isRead ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
          </span>
          {n.body ? <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span> : null}
          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            {timeAgo(n.createdAt)}
            {severity === 'action' ? (
              <span className="rounded-full bg-danger-soft px-1.5 py-px font-medium text-danger">Needs action</span>
            ) : null}
          </span>
        </span>
        {goes ? (
          <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        ) : null}
      </button>
    </li>
  );
}

export default function NotificationList({ items, role, onOpen, loading, error, limit = null }) {
  if (loading && !items.length) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">{error}</p>;
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
          <BellOff className="size-5" />
        </span>
        <p className="text-sm font-medium">You're all caught up</p>
        <p className="text-xs text-muted-foreground">New notifications will show up here.</p>
      </div>
    );
  }

  const shown = limit ? items.slice(0, limit) : items;
  const fresh = shown.filter((n) => !n.isRead);
  const earlier = shown.filter((n) => n.isRead);
  const group = (label, list) => (list.length ? (
    <div key={label}>
      <p className="bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="divide-y">
        {list.map((n) => <NotificationItem key={n.id} n={n} role={role} onOpen={onOpen} />)}
      </ul>
    </div>
  ) : null);

  return (
    <div>
      {group('New', fresh)}
      {group('Earlier', earlier)}
    </div>
  );
}
