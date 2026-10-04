// ─────────────────────────────────────────────────────────────
// client/src/pages/MessageHistoryPage.jsx
//
// Every email the system has sent, whatever sent it — invites,
// password resets, purchase orders to finance, collection reminders,
// donation and Section 18A emails, scheduled reports — newest first.
// One place to answer "did that go out?" instead of five.
//
// Admin only (route table and the server's GET
// /api/communications/messages). Laid out like every manager list:
// tabs by outcome, the message type as a filter chip, the table. The
// server pages in fifties; Next on the last loaded page fetches more.
//
// A row opens the message in the panel every other list uses
// (ui/detail-panel.jsx): the whole subject, address and failure reason,
// which the table has to squeeze. With it docked the table keeps only
// when, what and the outcome.
//
// History starts from the day migration 032 was applied: senders
// recorded their own outcomes elsewhere before that (each sender's own
// screen still shows those).
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import ViewTabs from '@/components/ui/view-tabs';
import ListToolbar from '@/components/ui/list-toolbar';
import StatusBadge from '@/components/ui/status-badge';
import EmptyState from '@/components/ui/empty-state';
import TablePager from '@/components/ui/table-pager';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ListCard from '@/components/ui/list-card';
import ErrorBanner from '@/components/ui/error-banner';
import DetailPanel from '@/components/ui/detail-panel';
import { useDockWidth } from '@/components/layout/detailDock';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/hooks/usePaged';
import { getMessages } from '../services/communicationsAPI';
import { STAFF } from '../routes/paths';

const VIEWS = [
  { id: 'all',     label: 'All',      status: null },
  { id: 'failed',  label: 'Failed',   status: 'failed', alert: true },
  { id: 'sent',    label: 'Sent',     status: 'sent' },
  { id: 'stubbed', label: 'Not sent', status: 'stubbed' },
];
const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

const STATUS_LABEL = { sent: 'Sent', stubbed: 'Not sent (email off)', failed: 'Failed' };

const fmtWhen = (iso) => (iso
  ? new Date(iso).toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  : '—');

// What the message was about, as a link where there is a screen for it.
const About = ({ m }) => {
  if (!m.relatedType || !m.relatedId) return <span className="text-muted-foreground">—</span>;
  if (m.relatedType === 'purchase_order') {
    return <Link className="underline-offset-2 hover:underline" to={`${STAFF.purchaseOrders}?id=${m.relatedId}`}>Purchase order</Link>;
  }
  const words = m.relatedType.replace(/_/g, ' ');
  return <span className="text-muted-foreground">{words.charAt(0).toUpperCase() + words.slice(1)} #{m.relatedId}</span>;
};

const Fact = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="break-words">{children}</dd>
  </div>
);

function MessagePanel({ message: m, typeLabel, onClose }) {
  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={fmtWhen(m.attemptedAt)}
      title={typeLabel[m.type] ?? m.type}
      badges={<StatusBadge kind="message" status={m.status}>{STATUS_LABEL[m.status] ?? m.status}</StatusBadge>}
    >
      {m.error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <p className="font-medium text-danger">Why it failed</p>
          <p className="mt-1 break-words text-danger">{m.error}</p>
        </div>
      ) : null}
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2"><Fact label="Subject">{m.subject || '—'}</Fact></div>
        <Fact label="To">{m.recipient || '—'}</Fact>
        <Fact label="Sent by">{m.sentByName || 'The system'}</Fact>
        <Fact label="About"><About m={m} /></Fact>
      </dl>
    </DetailPanel>
  );
}

export default function MessageHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  // A record docked beside the list: keep when, what and the outcome.
  const docked = useDockWidth() > 0;
  const view = viewById(searchParams.get('status'));
  const [type, setType] = useState('');

  const [messages, setMessages] = useState([]);
  const [types, setTypes] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaging, setIsPaging] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMessages({ type: type || undefined, status: view.status || undefined })
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages);
        setNextCursor(res.nextCursor);
        setTypes(res.types);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the message history.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [type, view.status]);

  const loadMore = async () => {
    if (!nextCursor || isPaging) return;
    setIsPaging(true);
    try {
      const res = await getMessages({ type: type || undefined, status: view.status || undefined, cursor: nextCursor });
      setMessages((prev) => [...prev, ...res.messages]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err.message || 'Could not load more messages.');
    } finally {
      setIsPaging(false);
    }
  };

  const page = usePaged(messages, TABLE_PAGE_SIZE, `${view.id}|${type}`);
  // Next on the last loaded page: fetch the next batch, then step on.
  const [advanceWhenLoaded, setAdvanceWhenLoaded] = useState(false);
  if (advanceWhenLoaded && page.page < page.pages) {
    setAdvanceWhenLoaded(false);
    page.next();
  }
  const next = async () => {
    if (page.page < page.pages) { page.next(); return; }
    if (!nextCursor) return;
    setAdvanceWhenLoaded(true);
    await loadMore();
  };

  const typeLabel = useMemo(() => Object.fromEntries(types.map((t) => [t.key, t.label])), [types]);
  const opened = openId == null ? null : messages.find((m) => m.id === openId) ?? null;

  const changeView = (id) => {
    setIsLoading(true);
    setSearchParams(id === 'all' ? {} : { status: id }, { replace: true });
  };
  const changeType = (value) => { setIsLoading(true); setType(value === 'any' ? '' : value); };

  return (
    <PageShell>
      <PageHeader
        title="Message history"
        description="Check which emails the system sent and which failed."
      />

      <ViewTabs className="mt-5" label="Message outcomes" value={view.id} onChange={changeView}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert }))} />

      <ErrorBanner className="mt-4" message={error} />

      <ListCard
        className="mt-6"
        header={
          <ListToolbar
            chips={type ? [{ key: 'type', label: typeLabel[type] ?? type, onRemove: () => changeType('any') }] : []}
          >
            <Select value={type || 'any'} onValueChange={changeType}>
              <SelectTrigger aria-label="Message type" className="w-60"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Every type</SelectItem>
                {types.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </ListToolbar>
        }
        footer={!isLoading && messages.length ? (
          <TablePager
            {...page} noun="messages" hasMore={Boolean(nextCursor)} loading={isPaging} next={next} alwaysShow
          />
        ) : null}
      >
        {isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No messages here"
            description={type || view.status ? 'Nothing matches this outcome and type.' : 'Nothing has been sent since message recording started.'}
          />
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px] pl-4 sm:pl-5">When</TableHead>
              <TableHead>Message</TableHead>
              {docked ? null : <TableHead>To</TableHead>}
              <TableHead>Outcome</TableHead>
              {docked ? null : <TableHead>About</TableHead>}
              {docked ? null : <TableHead>Sent by</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.slice.map((m) => (
              <TableRow
                key={m.id}
                className="cursor-pointer"
                data-state={m.id === openId ? 'selected' : undefined}
                onClick={() => setOpenId(m.id)}
              >
                <TableCell className="whitespace-nowrap pl-4 sm:pl-5 text-xs text-muted-foreground">{fmtWhen(m.attemptedAt)}</TableCell>
                <TableCell className="max-w-[260px] whitespace-normal">
                  <span className="block font-medium">{typeLabel[m.type] ?? m.type}</span>
                  <span className="block break-words text-xs text-muted-foreground">{m.subject || '—'}</span>
                </TableCell>
                {docked ? null : (
                  <TableCell className="max-w-[200px] break-words whitespace-normal text-sm">{m.recipient || '—'}</TableCell>
                )}
                <TableCell className="whitespace-normal">
                  <StatusBadge kind="message" status={m.status}>{STATUS_LABEL[m.status] ?? m.status}</StatusBadge>
                  {m.error ? <span className="mt-1 block break-words text-xs text-danger">{m.error}</span> : null}
                </TableCell>
                {docked ? null : (
                  // The link goes to the order; it should not also open the message.
                  <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}><About m={m} /></TableCell>
                )}
                {docked ? null : <TableCell className="text-xs">{m.sentByName || 'The system'}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </ListCard>

      {opened ? <MessagePanel message={opened} typeLabel={typeLabel} onClose={() => setOpenId(null)} /> : null}
    </PageShell>
  );
}
