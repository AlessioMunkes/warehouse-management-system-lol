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
import { Card, CardContent } from '@/components/ui/card';
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

export default function MessageHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const changeView = (id) => {
    setIsLoading(true);
    setSearchParams(id === 'all' ? {} : { status: id }, { replace: true });
  };
  const changeType = (value) => { setIsLoading(true); setType(value === 'any' ? '' : value); };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-medium">Message history</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every email the system has sent, and whether it went out. History starts when message recording was switched on.
      </p>

      <ViewTabs className="mt-5" label="Message outcomes" value={view.id} onChange={changeView}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert }))} />

      <div className="mt-6 space-y-4">
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

        {error ? (
          <div className="rounded-md border border-brand bg-danger-soft px-4 py-3 text-sm text-brand">{error}</div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No messages here"
            description={type || view.status ? 'Nothing matches this outcome and type.' : 'Nothing has been sent since message recording started.'}
          />
        ) : (
          <Card className="py-0">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px] pl-4">When</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>About</TableHead>
                    <TableHead>Sent by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.slice.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap pl-4 text-xs text-muted-foreground">{fmtWhen(m.attemptedAt)}</TableCell>
                      <TableCell className="max-w-[260px] whitespace-normal">
                        <span className="block font-medium">{typeLabel[m.type] ?? m.type}</span>
                        <span className="block break-words text-xs text-muted-foreground">{m.subject || '—'}</span>
                      </TableCell>
                      <TableCell className="max-w-[200px] break-words whitespace-normal text-sm">{m.recipient || '—'}</TableCell>
                      <TableCell className="whitespace-normal">
                        <StatusBadge kind="message" status={m.status}>{STATUS_LABEL[m.status] ?? m.status}</StatusBadge>
                        {m.error ? <span className="mt-1 block break-words text-xs text-danger">{m.error}</span> : null}
                      </TableCell>
                      <TableCell className="text-sm"><About m={m} /></TableCell>
                      <TableCell className="text-xs">{m.sentByName || 'The system'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePager
                {...page} noun="messages" hasMore={Boolean(nextCursor)} loading={isPaging} next={next}
                className="border-t px-3"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
