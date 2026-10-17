// ─────────────────────────────────────────────────────────────
// client/src/pages/NotificationsPage.jsx
//
// Every notification this manager or admin has received, read and
// unread, newest first. Not in the sidebar: it is opened from "See all
// notifications" at the foot of the bell, which only ever shows the
// latest few. Warehouse staff have their own (StaffNotificationsPage).
//
// The same list every manager screen uses: All / Unread tabs, a search,
// "+ Filter" by type, Columns (the notification itself always on), and
// older notifications loaded a batch at a time as Next reaches them.
// Opening one marks it read and goes where the bell would go.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import notificationAPI from '../services/notificationAPI';
import {
  notificationDestination, notificationIcon, notificationTypeLabel, timeAgo,
  announceNotificationsChanged, NOTIFICATIONS_CHANGED,
} from '../features/notifications/notificationMatrix';
import { useAuth } from '../context/AuthContext';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import MasterDataTable from '../features/masterdata/MasterDataTable';
import useTableView from '../features/masterdata/useTableView';
import useListFilters from '../features/masterdata/useListFilters';
import { formatShortDateTime as fmtWhen } from '@/lib/dates';

const BATCH = 100;

const COLUMNS = [
  { key: 'notification', label: 'Notification', alwaysOn: true, weight: 5,
    sort: (n) => (n.title ?? '').toLowerCase(),
    cellClass: '',
    cell: (n) => {
      const Icon = notificationIcon(n);
      return (
        <span className="flex items-start gap-2.5">
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className={`block ${n.isRead ? '' : 'font-semibold'}`}>{n.title}</span>
            {n.body ? <span className="block text-xs text-muted-foreground">{n.body}</span> : null}
          </span>
        </span>
      );
    } },
  { key: 'type', label: 'Type', weight: 2, minWidth: 'md',
    sort: (n) => notificationTypeLabel(n.type).toLowerCase(),
    cell: (n) => notificationTypeLabel(n.type) },
  { key: 'received', label: 'Received', weight: 2, numeric: true,
    sort: (n) => new Date(n.createdAt).getTime(),
    cell: (n) => <span title={fmtWhen(n.createdAt)}>{timeAgo(n.createdAt)}</span> },
  { key: 'status', label: 'Status', weight: 1.6, minWidth: 'sm',
    sort: (n) => (n.isRead ? 1 : 0),
    cellClass: '',
    cell: (n) => (n.isRead
      ? <StatusBadge tone="neutral">Read</StatusBadge>
      : <StatusBadge tone="info">Unread</StatusBadge>) },
];

const VIEWS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'unread', label: 'Unread', test: (n) => !n.isRead },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const filterDefs = useMemo(() => [
    { key: 'type', label: 'Type', valueOf: (n) => n.type, labelOf: notificationTypeLabel },
    { key: 'opens', label: 'Opens', valueOf: (n) => (notificationDestination(n, user?.role) ? 'yes' : 'no'),
      labelOf: (v) => (v === 'yes' ? 'Opens a record' : 'For information only') },
  ], [user?.role]);
  const view = useTableView('notifications', COLUMNS);
  const listFilters = useListFilters(filterDefs, items);

  const load = useCallback(async () => {
    setError(null);
    try {
      const first = await notificationAPI.getNotifications({ limit: BATCH });
      setItems(first);
      setHasMore(first.length === BATCH);
    } catch (err) {
      setError(err.message || 'Could not load your notifications.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Read elsewhere (the bell): show it here too.
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [load]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await notificationAPI.getNotifications({ limit: BATCH, offset: items.length });
      setItems((all) => [...all, ...next]);
      setHasMore(next.length === BATCH);
    } catch (err) {
      setError(err.message || 'Could not load older notifications.');
    } finally {
      setLoadingMore(false);
    }
  };

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, items.filter(v.test).length])),
    [items],
  );
  const current = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];
  const q = search.trim().toLowerCase();
  const { apply: applyFilters } = listFilters;
  const rows = useMemo(() => view.sortRows(applyFilters(items.filter(current.test))
    .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))), [items, current, q, applyFilters, view]);

  const open = async (n) => {
    if (!n.isRead) {
      setItems((all) => all.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      try { await notificationAPI.markNotificationRead(n.id); announceNotificationsChanged(); } catch { /* the badge self-corrects */ }
    }
    const to = notificationDestination(n, user?.role);
    if (to) navigate(to);
  };

  const markAll = async () => {
    setItems((all) => all.map((n) => ({ ...n, isRead: true })));
    try { await notificationAPI.markAllNotificationsRead(); announceNotificationsChanged(); } catch { load(); }
  };

  const clearAll = () => { setSearch(''); listFilters.clear(); };

  return (
    <PageShell>
      <PageHeader
        title="Notifications"
        description="Everything sent to you, newest first. Open one to go to it."
        actions={counts.unread > 0 ? (
          <Button type="button" variant="outline" onClick={markAll}><CheckCheck /> Mark all read</Button>
        ) : null}
      />

      <ErrorBanner className="mt-4" message={error} onRetry={load} />

      <ViewTabs
        className="mt-5"
        label="Notification views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: isLoading ? null : counts[v.id], alert: v.id === 'unread' }))}
      />

      <div className="mt-6">
        <ListCard
          header={
            <ListToolbar
              search={{ value: search, onChange: setSearch, placeholder: 'Search notifications' }}
              filters={listFilters.filters}
              onClearAll={clearAll}
              columns={{
                idPrefix: 'notifications',
                columns: view.availableColumns,
                hidden: view.hidden,
                onToggle: view.toggleColumn,
                onReset: view.resetColumns,
              }}
            />
          }
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={items.length === 0 ? 'No notifications yet' : 'No notifications match'}
              description={items.length === 0
                ? 'Notifications about stock, orders, slips and donations appear here.'
                : tab === 'unread' && !q && !listFilters.active ? 'You have read them all.' : 'Try another search or filter.'}
              action={q || listFilters.active ? { label: 'Clear all filters', onClick: clearAll } : undefined}
            />
          ) : (
            <MasterDataTable
              columns={view.visibleColumns}
              rows={rows}
              sort={view.sort}
              onToggleSort={view.toggleSort}
              onOpenRow={open}
              noun="notifications"
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
            />
          )}
        </ListCard>
      </div>
    </PageShell>
  );
}
