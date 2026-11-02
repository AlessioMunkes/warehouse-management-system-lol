import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellOff, Copy, ExternalLink, Mail, MessageCircle, RefreshCw, Send, UsersRound } from 'lucide-react';
import collectionReminderAPI from '../services/collectionReminderAPI';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import SharedStatusBadge from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import TablePager from '@/components/ui/table-pager';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/usePaged';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';
import { groupReminderMessage } from '@/features/reminders/groupReminder';

// Every column but the centre can be hidden. Actions is the row's
// buttons, not data, so it always shows.
const COLUMNS = [
  { key: 'ecd', label: 'ECD', alwaysOn: true },
  { key: 'contact', label: 'Contact' },
  { key: 'collection', label: 'Collection' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'actions', label: '', alwaysOn: true },
];
const STATUS_WORD = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') : v);
const REMINDER_FILTERS = [
  { key: 'email', label: 'Email', valueOf: (r) => r.emailStatus, labelOf: STATUS_WORD },
  { key: 'whatsapp', label: 'WhatsApp', valueOf: (r) => r.whatsappStatus, labelOf: STATUS_WORD },
];

const STATUS_LABELS = {
  pending: 'Pending',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const StatusBadge = ({ status }) => {
  const normalized = status ? String(status).toLowerCase() : null;
  return (
    <SharedStatusBadge kind="reminder" status={normalized}>
      {STATUS_LABELS[normalized] ?? 'Not queued'}
    </SharedStatusBadge>
  );
};

// The tabs: what is left to do first. WhatsApp goes out by hand, so a
// reminder with a number and no "sent" is still somebody's job.
const VIEWS = [
  { id: 'all',      label: 'All',             test: () => true },
  { id: 'whatsapp', label: 'WhatsApp to send', alert: true, test: (r) => Boolean(r.whatsappLink) && r.whatsappStatus !== 'sent' },
  { id: 'failed',   label: 'Email failed',    alert: true, test: (r) => r.emailStatus === 'failed' },
];

const formatDate = (value) => {
  if (!value) return 'Not scheduled';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const collectionWhen = (reminder, fallbackDate) => {
  const date = formatDate(reminder.collectionDate ?? fallbackDate);
  return reminder.collectionTime ? `${date}, ${reminder.collectionTime}` : date;
};

export default function EcdCollectionRemindersPage() {
  const [collectionDate, setCollectionDate] = useState(null);
  const [closed, setClosed] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await collectionReminderAPI.getTomorrowCollectionReminders();
      setCollectionDate(data.collectionDate);
      setClosed(data.closed ?? null);
      setReminders(data.reminders);
    } catch (err) {
      setError(err.message || 'Could not load collection reminders.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    collectionReminderAPI.getTomorrowCollectionReminders()
      .then((data) => {
        if (cancelled) return;
        setCollectionDate(data.collectionDate);
      setClosed(data.closed ?? null);
        setReminders(data.reminders);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load collection reminders.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, reminders.filter(v.test).length])),
    [reminders],
  );
  const tableView = useTableView('collectionReminders', COLUMNS);
  const show = tableView.isVisible;
  const listFilters = useListFilters(REMINDER_FILTERS, reminders);
  const { apply: applyFilters } = listFilters;
  const visible = useMemo(() => {
    const view = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];
    const q = search.trim().toLowerCase();
    return applyFilters(reminders).filter((r) => view.test(r)
      && (!q || `${r.ecdName ?? ''} ${r.contactName ?? ''}`.toLowerCase().includes(q)));
  }, [reminders, search, tab, applyFilters]);

  const markSent = async (reminder) => {
    setBusyId(reminder.id);
    setError(null);
    try {
      const updated = await collectionReminderAPI.markWhatsAppReminderSent(reminder.id);
      setReminders((rows) => rows.map((row) => (
        row.id === reminder.id ? { ...row, ...updated, whatsappStatus: updated.whatsappStatus || 'sent' } : row
      )));
    } catch (err) {
      setError(err.message || 'Could not mark WhatsApp reminder sent.');
    } finally {
      setBusyId(null);
    }
  };

  const retryEmail = async (reminder) => {
    if (!reminder.canRetryEmail) return;
    setBusyId(reminder.id);
    setError(null);
    try {
      await collectionReminderAPI.retryEmailReminder(reminder);
      await load();
    } catch (err) {
      setError(err.message || 'Could not retry email reminder.');
    } finally {
      setBusyId(null);
    }
  };

  // Reminders, fifteen to a page.
  const reminderPage = usePaged(visible, TABLE_PAGE_SIZE, `${visible.length}|${tab}|${search}`);

  // Every centre collecting tomorrow, once, for a group or broadcast list.
  const groupMessage = reminders.length && collectionDate
    ? groupReminderMessage([...new Set(reminders.map((r) => r.ecdName).filter(Boolean))].sort(), formatDate(collectionDate))
    : '';
  const [copied, setCopied] = useState(false);
  const copyGroupMessage = async () => {
    try {
      await navigator.clipboard.writeText(groupMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy the message. Open it in WhatsApp instead.');
    }
  };
  return (
    <PageShell>
      <PageHeader
        title="Collection reminders"
        description={closed
          ? `Tomorrow, ${formatDate(collectionDate)}, the warehouse is closed (${closed.label}), so no reminders go out.`
          : collectionDate
          ? `Send reminders to centres collecting tomorrow, ${formatDate(collectionDate)}.`
          : "Tomorrow's queued reminders for ECD collections."}
        actions={
          <Button type="button" variant="outline" onClick={load}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <ErrorBanner className="mt-4" message={error} onRetry={load} />

      <ViewTabs
        className="mt-5"
        label="Reminder views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          header={
            <div className="space-y-2">
              <ListToolbar
                search={{ value: search, onChange: setSearch, placeholder: 'Search by ECD or contact' }}
                filters={listFilters.filters}
                onClearAll={() => { setSearch(''); listFilters.clear(); }}
                columns={{
                  idPrefix: 'reminders',
                  columns: tableView.availableColumns,
                  hidden: tableView.hidden,
                  onToggle: tableView.toggleColumn,
                  onReset: tableView.resetColumns,
                }}
              />
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <MessageCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                Open WhatsApp fills in the centre’s number and message. Send it from the WhatsApp account on this
                device, then choose Mark sent.
              </p>
              {groupMessage ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <p className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                    <UsersRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    One reminder naming every centre collecting tomorrow, for a WhatsApp group or broadcast list.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={copyGroupMessage}>
                    <Copy /> {copied ? 'Copied' : 'Copy group message'}
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm"
                    title="Opens WhatsApp with the message typed in. Choose the group or broadcast list to send it to."
                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(groupMessage)}`, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink /> Send to a group
                  </Button>
                </div>
              ) : null}
            </div>
          }
          footer={!isLoading && visible.length ? <TablePager {...reminderPage} noun="reminders" alwaysShow /> : null}
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : reminders.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title={closed ? `The warehouse is closed tomorrow: ${closed.label}` : 'No reminders queued'}
              description={closed
                ? 'No reminders go out for a closed day. It is set on the operating calendar.'
                : 'No reminders are queued for tomorrow.'}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title={search ? 'No reminders match' : 'Nothing in this view'}
              description={search ? 'Nothing matches the search.' : 'Nothing is waiting here.'}
              action={search ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
            />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-5">ECD</TableHead>
                {show('contact') ? <TableHead>Contact</TableHead> : null}
                {show('collection') ? <TableHead>Collection</TableHead> : null}
                {show('email') ? <TableHead>Email</TableHead> : null}
                {show('whatsapp') ? <TableHead>WhatsApp</TableHead> : null}
                {show('mobile') ? <TableHead>Mobile</TableHead> : null}
                <TableHead className="pr-4 text-right sm:pr-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminderPage.slice.map((reminder) => (
                <TableRow key={reminder.id}>
                  <TableCell className="pl-4 font-medium sm:pl-5">{reminder.ecdName}</TableCell>
                  {show('contact') ? <TableCell>{reminder.contactName || 'Not recorded'}</TableCell> : null}
                  {show('collection') ? <TableCell>{collectionWhen(reminder, collectionDate)}</TableCell> : null}
                  {show('email') ? (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="size-4 text-muted-foreground" />
                        <StatusBadge status={reminder.emailStatus} />
                      </div>
                    </TableCell>
                  ) : null}
                  {show('whatsapp') ? (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MessageCircle className="size-4 text-muted-foreground" />
                        <StatusBadge status={reminder.whatsappStatus} />
                      </div>
                    </TableCell>
                  ) : null}
                  {show('mobile') ? <TableCell>{reminder.mobileNumber || 'Not recorded'}</TableCell> : null}
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!reminder.whatsappLink}
                        title={
                          reminder.whatsappLink
                            ? 'Opens WhatsApp with the ECD mobile number and prefilled reminder text. Send it manually from the account logged in on this device.'
                            : 'No usable ECD mobile number is available.'
                        }
                        aria-label={`Open WhatsApp for ${reminder.ecdName}`}
                        onClick={() => window.open(reminder.whatsappLink, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink />
                        Open WhatsApp
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!reminder.whatsappLink || reminder.whatsappStatus === 'sent' || busyId === reminder.id}
                        title="Choose this after sending the message in WhatsApp."
                        aria-label={`Mark WhatsApp sent for ${reminder.ecdName}`}
                        onClick={() => markSent(reminder)}
                      >
                        <Send />
                        Mark sent
                      </Button>
                      {reminder.emailStatus === 'failed' && reminder.canRetryEmail ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyId === reminder.id}
                          onClick={() => retryEmail(reminder)}
                        >
                          <RefreshCw />
                          Retry email
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </ListCard>
      </div>
    </PageShell>
  );
}
