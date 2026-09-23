import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Mail, MessageCircle, RefreshCw, Send } from 'lucide-react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import collectionReminderAPI from '../services/collectionReminderAPI';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const STATUS_LABELS = {
  pending: 'Pending',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const statusVariant = (status) => {
  if (status === 'sent') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'pending' || status === 'sending') return 'secondary';
  return 'outline';
};

const StatusBadge = ({ status }) => {
  const normalized = status ? String(status).toLowerCase() : null;
  return (
    <Badge variant={statusVariant(normalized)}>
      {STATUS_LABELS[normalized] ?? 'Not queued'}
    </Badge>
  );
};

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
    setIsLoading(true);
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

  const summary = useMemo(() => ({
    total: reminders.length,
    whatsappReady: reminders.filter((r) => r.whatsappLink).length,
    emailFailed: reminders.filter((r) => r.emailStatus === 'failed').length,
  }), [reminders]);

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

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-medium">ECD collection reminders</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tomorrow's queued reminders for ECD collections.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={load}>
            <RefreshCw />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mt-4 rounded-[4px] border-2 border-brand bg-danger-soft p-4 text-sm text-ink">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardHeader><CardTitle className="text-sm">Collection date</CardTitle></CardHeader>
                <CardContent className="text-lg font-medium">{formatDate(collectionDate)}</CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Queued ECDs</CardTitle></CardHeader>
                <CardContent className="text-lg font-medium">{summary.total}</CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">WhatsApp ready</CardTitle></CardHeader>
                <CardContent className="text-lg font-medium">{summary.whatsappReady}</CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="size-4" />
                  Manual WhatsApp sending
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Open WhatsApp uses the ECD mobile number and prefilled reminder text from WMS.
                  The message is sent manually from the WhatsApp account currently logged in on this device or browser.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ECD</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Collection</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No reminders are queued for tomorrow.
                        </TableCell>
                      </TableRow>
                    ) : reminders.map((reminder) => (
                      <TableRow key={reminder.id}>
                        <TableCell className="font-medium">{reminder.ecdName}</TableCell>
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
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </ManagerLayout>
  );
}
