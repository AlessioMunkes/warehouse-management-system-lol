import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellOff, ExternalLink, Mail, MessageCircle, RefreshCw, Send } from 'lucide-react';
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
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/hooks/usePaged';

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
  const visible = useMemo(() => {
    const view = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];
    const q = search.trim().toLowerCase();
    return reminders.filter((r) => view.test(r)
      && (!q || `${r.ecdName ?? ''} ${r.contactName ?? ''}`.toLowerCase().includes(q)));
  }, [reminders, search, tab]);

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
  return (
    <PageShell>
      <PageHeader
        title="Collection reminders"
        description={collectionDate
          ? `Reminders queued for ECDs collecting tomorrow, ${formatDate(collectionDate)}.`
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
              <ListToolbar search={{ value: search, onChange: setSearch, placeholder: 'Search by ECD or contact' }} />
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <MessageCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                Open WhatsApp uses the ECD mobile number and prefilled reminder text from WMS.
                The message is sent manually from the WhatsApp account currently logged in on this device or browser.
              </p>
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
              title="No reminders queued"
              description="No reminders are queued for tomorrow."
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
                <TableHead>Contact</TableHead>
                <TableHead>Collection</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead className="pr-4 text-right sm:pr-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminderPage.slice.map((reminder) => (
                <TableRow key={reminder.id}>
                  <TableCell className="pl-4 font-medium sm:pl-5">{reminder.ecdName}</TableCell>
                  <TableCell>{reminder.contactName || 'Not recorded'}</TableCell>
                  <TableCell>{collectionWhen(reminder, collectionDate)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 text-muted-foreground" />
                      <StatusBadge status={reminder.emailStatus} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="size-4 text-muted-foreground" />
                      <StatusBadge status={reminder.whatsappStatus} />
                    </div>
                  </TableCell>
                  <TableCell>{reminder.mobileNumber || 'Not recorded'}</TableCell>
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
                        title="After sending the WhatsApp message manually, mark it sent in WMS."
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
