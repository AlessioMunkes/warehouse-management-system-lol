// ─────────────────────────────────────────────────────────────
// client/src/pages/Section18AManagementPage.jsx
// Route: /admin/section-18a-management
//
// Admin page for managing Section 18A tax certificates and email
// integration. Includes certificate queue and email history.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  FileText, Mail, Send,
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2,
} from 'lucide-react';
//import { TopNavbar } from '../components/layout/TopNavBar';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import NativeSelect from '@/components/ui/native-select';
import { Skeleton } from '../components/ui/skeleton';
import StatusBadge from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import Notice from '@/components/ui/notice';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import donationManagementAPI from '../services/donationManagementAPI';
import TablePager from '@/components/ui/table-pager';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/usePaged';

const TABS = [
  { id: 'certificates', label: 'Certificate Queue', icon: FileText, description: 'View and manage Section 18A tax certificates for donations.' },
  { id: 'emails', label: 'Email history', icon: Mail, description: 'Track and resend Section 18A certificate emails.' },
];

const EMAIL_STATUS_CONFIG = {
  sent: { icon: CheckCircle2, color: 'text-good', bg: 'bg-good-soft', label: 'Sent' },
  delivered: { icon: CheckCircle2, color: 'text-good', bg: 'bg-good-soft', label: 'Delivered' },
  failed: { icon: XCircle, color: 'text-danger', bg: 'bg-danger-soft', label: 'Failed' },
  pending: { icon: Clock, color: 'text-warn', bg: 'bg-warn-soft', label: 'Pending' },
  bounced: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger-soft', label: 'Bounced' },
  SENT: { icon: CheckCircle2, color: 'text-good', bg: 'bg-good-soft', label: 'Sent' },
  DELIVERED: { icon: CheckCircle2, color: 'text-good', bg: 'bg-good-soft', label: 'Delivered' },
  FAILED: { icon: XCircle, color: 'text-danger', bg: 'bg-danger-soft', label: 'Failed' },
  PENDING: { icon: Clock, color: 'text-warn', bg: 'bg-warn-soft', label: 'Pending' },
  BOUNCED: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger-soft', label: 'Bounced' },
};


export default function Section18AManagementPage() {
  const [tab, setTab] = useState('certificates');
  const [certificateQueue, setCertificateQueue] = useState([]);
  const [emailHistory, setEmailHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [confirmResend, setConfirmResend] = useState(null);
  const [emailSearch, setEmailSearch] = useState('');
  const [emailTypeFilter, setEmailTypeFilter] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState('');
  const [donorSearch, setDonorSearch] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [queueSort, setQueueSort] = useState('date-asc');
  const initialLoadDone = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const certificates = await donationManagementAPI.getSection18AQueue();
      setCertificateQueue(certificates);
    } catch (err) {
      setError(err.message || 'Failed to load Section 18A data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Email history comes from the database only (never Gmail) — newest
  // first. Search covers recipient, donor, donation ID and subject;
  // type/status filters narrow server-side.
  const loadEmailHistory = useCallback(async ({ search, emailType, status } = {}) => {
    setEmailLoading(true);
    try {
      const emails = await donationManagementAPI.getEmailHistory({ search, emailType, status });
      setEmailHistory(emails);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load email history.' });
    } finally {
      setEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadData();
    loadEmailHistory({});
  }, [loadData, loadEmailHistory]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    const timer = setTimeout(() => {
      loadEmailHistory({
        search: emailSearch || null,
        emailType: emailTypeFilter || null,
        status: emailStatusFilter || null,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [emailSearch, emailTypeFilter, emailStatusFilter, loadEmailHistory, tab]);

  const handleResendEmail = async (emailId) => {
    setActionLoading(`resend-${emailId}`);
    setConfirmResend(null);
    setFeedback(null);
    try {
      await donationManagementAPI.resendEmail(emailId);
      setFeedback({ type: 'success', message: 'Email resent successfully.' });
      await loadEmailHistory({
        search: emailSearch || null,
        emailType: emailTypeFilter || null,
        status: emailStatusFilter || null,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to resend email.' });
    } finally {
      setActionLoading(null);
    }
  };

  const activeTab = TABS.find((item) => item.id === tab) || TABS[0];
  const normaliseStatusKey = (status) => String(status || '').toLowerCase();
  const getEmailStatusConfig = (status) => EMAIL_STATUS_CONFIG[status] || EMAIL_STATUS_CONFIG[normaliseStatusKey(status)] || EMAIL_STATUS_CONFIG.pending;
  const normaliseTypeLabel = (emailType) => {
    const v = String(emailType || '');
    if (v === 'THANK_YOU' || v === 'thank_you') return 'Thank you';
    if (v === 'SECTION_18A' || v === 'section18a_certificate') return 'Section 18A';
    return v || '—';
  };
  const emailRecipientOf = (email) => email.recipient_email || email.recipientEmail || email.recipient || '—';
  const emailDonationRefOf = (email) => email.donation_id ?? email.donationId ?? email.donationRef ?? email.donation_ref ?? '—';
  const emailSentAtOf = (email) => email.sent_at ?? email.sentAt ?? email.created_at ?? email.createdAt ?? null;
  const queueDonorOf = (item) => item.donorName || item.donor_name || '';
  const queueAmountOf = (item) => {
    const amount = item.estimated_value_zar ?? item.amount;
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const queueDateOf = (item) => item.received_at || item.createdAt || item.date || null;
  const queueDateTimeOf = (item) => {
    const raw = queueDateOf(item);
    const time = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(time) ? time : 0;
  };
  const filteredCertificateQueue = certificateQueue
    .filter((item) => {
      const donor = queueDonorOf(item).toLowerCase();
      const amount = queueAmountOf(item);
      const dateTime = queueDateTimeOf(item);
      const min = amountMin === '' ? null : Number(amountMin);
      const max = amountMax === '' ? null : Number(amountMax);
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

      if (donorSearch.trim() && !donor.includes(donorSearch.trim().toLowerCase())) return false;
      if (min !== null && Number.isFinite(min) && (amount === null || amount < min)) return false;
      if (max !== null && Number.isFinite(max) && (amount === null || amount > max)) return false;
      if (from !== null && Number.isFinite(from) && dateTime < from) return false;
      if (to !== null && Number.isFinite(to) && dateTime > to) return false;
      return true;
    })
    .sort((a, b) => {
      if (queueSort === 'amount-asc') return (queueAmountOf(a) ?? Infinity) - (queueAmountOf(b) ?? Infinity);
      if (queueSort === 'amount-desc') return (queueAmountOf(b) ?? -Infinity) - (queueAmountOf(a) ?? -Infinity);
      if (queueSort === 'date-desc') return queueDateTimeOf(b) - queueDateTimeOf(a);
      return queueDateTimeOf(a) - queueDateTimeOf(b);
    });

  // Certificates, fifteen to a page.
  const certPage = usePaged(filteredCertificateQueue, TABLE_PAGE_SIZE, `${donorSearch}|${filteredCertificateQueue.length}`);
  // Emails, fifteen to a page.
  const emailPage = usePaged(emailHistory, TABLE_PAGE_SIZE, emailHistory.length);
  // The figures the four tiles used to show, now one line above the table.
  const emailCounts = {
    sent: emailHistory.filter((e) => ['sent', 'delivered', 'SENT', 'DELIVERED'].includes(e.status)).length,
    failed: emailHistory.filter((e) => ['failed', 'bounced', 'FAILED', 'BOUNCED'].includes(e.status)).length,
    pending: emailHistory.filter((e) => ['pending', 'PENDING'].includes(e.status)).length,
  };
  const toneOf = (config) => ({ 'text-good': 'good', 'text-danger': 'bad', 'text-warn': 'warn' }[config.color] ?? 'neutral');

  return (
    <PageShell>
      <PageHeader title="Section 18A" description="Issue donors’ tax certificates and resend certificate emails." />

      <ViewTabs
        className="mt-5"
        label="Section 18A management sections"
        value={tab}
        onChange={setTab}
        tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: t.id === 'certificates' && !loading ? certificateQueue.length : null }))}
      />
      <p className="mt-4 text-sm text-muted-foreground">{activeTab.description}</p>

      {feedback && (
        feedback.type === 'success'
          ? <Notice className="mt-4" message={feedback.message} onClear={() => setFeedback(null)} />
          : <ErrorBanner className="mt-4" message={feedback.message} />
      )}
      <ErrorBanner className="mt-4" message={error} />

      {tab === 'certificates' && (
        <ListCard
          className="mt-6"
          header={
            <ListToolbar
              search={{ value: donorSearch, onChange: setDonorSearch, placeholder: 'Search donor name', label: 'Search by donor name' }}
              note={`${filteredCertificateQueue.length} of ${certificateQueue.length}`}
            >
              <Input type="number" aria-label="Minimum amount" placeholder="Min R" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} className="h-8 w-24" />
              <Input type="number" aria-label="Maximum amount" placeholder="Max R" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className="h-8 w-24" />
              <Input type="date" aria-label="Date from" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-auto" />
              <Input type="date" aria-label="Date to" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-auto" />
              <NativeSelect aria-label="Sort certificate queue" value={queueSort} onChange={(e) => setQueueSort(e.target.value)} size="sm">
                <option value="date-asc">Date: oldest first</option>
                <option value="date-desc">Date: newest first</option>
                <option value="amount-asc">Amount: low to high</option>
                <option value="amount-desc">Amount: high to low</option>
              </NativeSelect>
            </ListToolbar>
          }
          footer={!loading && filteredCertificateQueue.length ? <TablePager {...certPage} noun="certificates" alwaysShow /> : null}
        >
          {loading ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading Section 18A data">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : certificateQueue.length === 0 ? (
            <EmptyState icon={FileText} title="No certificates in the queue" description="Donations that need a Section 18A certificate appear here." />
          ) : filteredCertificateQueue.length === 0 ? (
            <EmptyState icon={FileText} title="No certificates match" description="Try another search, amount or date." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Donation</TableHead>
                  <TableHead>Donor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certPage.slice.map((item) => {
                  const formattedDate = item.received_at
                    ? new Date(item.received_at).toLocaleDateString()
                    : item.createdAt
                      ? new Date(item.createdAt).toLocaleDateString()
                      : item.date || '—';
                  const formattedAmount = item.estimated_value_zar != null
                    ? `R${Number(item.estimated_value_zar).toFixed(2)}`
                    : item.amount != null
                      ? `R${item.amount}`
                      : '—';

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.reference || item.id}</TableCell>
                      <TableCell>{item.donorName || item.donor_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{formattedDate}</TableCell>
                      <TableCell className="text-right tabular-nums">{formattedAmount}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ListCard>
      )}

      {tab === 'emails' && (
        <ListCard
          className="mt-6"
          header={
            <div className="space-y-2">
              <ListToolbar
                search={{ value: emailSearch, onChange: setEmailSearch, placeholder: 'Recipient, donor, donation, subject', label: 'Search email history' }}
              >
                <NativeSelect aria-label="Filter by email type" value={emailTypeFilter} onChange={(e) => setEmailTypeFilter(e.target.value)} size="sm">
                  <option value="">All types</option>
                  <option value="THANK_YOU">Thank you</option>
                  <option value="SECTION_18A">Section 18A</option>
                </NativeSelect>
                <NativeSelect aria-label="Filter by email status" value={emailStatusFilter} onChange={(e) => setEmailStatusFilter(e.target.value)} size="sm">
                  <option value="">All statuses</option>
                  <option value="SENT">Sent</option>
                  <option value="FAILED">Failed</option>
                  <option value="PENDING">Pending</option>
                </NativeSelect>
                {(emailSearch || emailTypeFilter || emailStatusFilter) && (
                  <Button variant="ghost" size="sm" onClick={() => { setEmailSearch(''); setEmailTypeFilter(''); setEmailStatusFilter(''); }}>
                    Clear
                  </Button>
                )}
              </ListToolbar>
              <p className="text-sm text-muted-foreground tabular-nums">
                {emailHistory.length} email{emailHistory.length === 1 ? '' : 's'}
                {' · '}<span className="text-good">{emailCounts.sent} sent</span>
                {' · '}<span className="text-danger">{emailCounts.failed} failed</span>
                {' · '}<span className="text-warn">{emailCounts.pending} pending</span>
              </p>
            </div>
          }
          footer={!emailLoading && emailHistory.length ? <TablePager {...emailPage} noun="emails" alwaysShow /> : null}
        >
          {emailLoading ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading email history">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : emailHistory.length === 0 ? (
            <EmptyState icon={Mail} title="No emails match" description="Try another search or filter." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead><TableHead>Donor</TableHead><TableHead>Donation</TableHead><TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Sent At</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emailPage.slice.map((email) => {
                  const statusConfig = getEmailStatusConfig(email.status);
                  const sentAt = emailSentAtOf(email);
                  return (
                    <TableRow key={email.id}>
                      <TableCell className="font-medium">{emailRecipientOf(email)}</TableCell>
                      <TableCell>{email.donor_name || email.donorName || email.recipient_name || email.recipientName || '—'}</TableCell>
                      <TableCell>{emailDonationRefOf(email)}</TableCell>
                      <TableCell><Badge variant="outline">{normaliseTypeLabel(email.email_type || email.emailType)}</Badge></TableCell>
                      <TableCell className="max-w-[200px] truncate">{email.subject || '—'}</TableCell>
                      <TableCell><StatusBadge tone={toneOf(statusConfig)} icon={statusConfig.icon}>{statusConfig.label}</StatusBadge></TableCell>
                      <TableCell className="text-muted-foreground">{sentAt ? new Date(sentAt).toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmResend(email)} disabled={actionLoading === `resend-${email.id}`}>
                          {actionLoading === `resend-${email.id}` ? <Loader2 className="animate-spin" /> : <Send />}Resend
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ListCard>
      )}

      <AlertDialog open={!!confirmResend} onOpenChange={() => setConfirmResend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resend Email?</AlertDialogTitle><AlertDialogDescription>This will send the donation email to <strong>{confirmResend?.recipient_email || confirmResend?.recipientEmail || confirmResend?.recipient || 'the recipient'}</strong> again.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => confirmResend && handleResendEmail(confirmResend.id)}>Resend Email</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
