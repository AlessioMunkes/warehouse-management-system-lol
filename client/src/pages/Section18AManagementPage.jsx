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
//import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import donationManagementAPI from '../services/donationManagementAPI';

const TABS = [
  { id: 'certificates', label: 'Certificate Queue', icon: FileText, description: 'View and manage Section 18A tax certificates for donations.' },
  { id: 'emails', label: 'Email Integration', icon: Mail, description: 'Track and resend Section 18A certificate emails.' },
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

  return (
    <div className="min-h-screen bg-canvas text-ink font-['Montserrat',sans-serif]">
    
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-medium">Section 18A Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage tax certificates and email delivery.</p>
        <div className="mt-5 flex flex-wrap gap-1 border-b" role="tablist" aria-label="Section 18A management sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={tab === t.id ? 'flex items-center gap-2 border-b-2 border-foreground px-4 py-2 text-sm font-medium' : 'flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground'}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{activeTab.description}</p>
        {feedback && (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-good bg-good-soft text-good' : 'border-danger bg-danger-soft text-danger'}`} role="alert">
            {feedback.message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</div>
        )}
        {loading ? (
          <div className="mt-8 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-sm text-muted-foreground">Loading Section 18A data...</span>
          </div>
        ) : (
          <>
            {tab === 'certificates' && (
              <div className="mt-6">
                <Card className="rounded-[12px] border border-line shadow-sm">
                  <CardHeader>
                    <CardTitle>Certificate Queue</CardTitle>
                    <CardDescription>{filteredCertificateQueue.length} of {certificateQueue.length} donation{certificateQueue.length !== 1 ? 's' : ''} in the Section 18A certificate queue.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(5,minmax(120px,auto))]">
                      <input type="search" aria-label="Search by donor name" placeholder="Search donor name" value={donorSearch} onChange={(e) => setDonorSearch(e.target.value)} className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm" />
                      <input type="number" aria-label="Minimum amount" placeholder="Min amount" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm" />
                      <input type="number" aria-label="Maximum amount" placeholder="Max amount" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm" />
                      <input type="date" aria-label="Date from" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm" />
                      <input type="date" aria-label="Date to" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm" />
                      <select aria-label="Sort certificate queue" value={queueSort} onChange={(e) => setQueueSort(e.target.value)} className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm">
                        <option value="date-asc">Date: oldest first</option>
                        <option value="date-desc">Date: newest first</option>
                        <option value="amount-asc">Amount: low to high</option>
                        <option value="amount-desc">Amount: high to low</option>
                      </select>
                    </div>
                    {certificateQueue.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/40" />
                        <p className="mt-3 text-sm text-muted-foreground">No certificates in the queue.</p>
                      </div>
                    ) : filteredCertificateQueue.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/40" />
                        <p className="mt-3 text-sm text-muted-foreground">No certificates match the current filters.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Donation</TableHead>
                              <TableHead>Donor</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredCertificateQueue.map((item) => {
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
                                  <TableCell>{formattedDate}</TableCell>
                                  <TableCell>{formattedAmount}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            {tab === 'emails' && (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 sm:grid-cols-4">
                  <Card className="rounded-[12px] border border-line shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Total Emails</p><p className="mt-1 text-2xl font-semibold">{emailHistory.length}</p></CardContent></Card>
                  <Card className="rounded-[12px] border border-line shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Sent</p><p className="mt-1 text-2xl font-semibold text-good">{emailHistory.filter((e) => ['sent', 'delivered', 'SENT', 'DELIVERED'].includes(e.status)).length}</p></CardContent></Card>
                  <Card className="rounded-[12px] border border-line shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Failed</p><p className="mt-1 text-2xl font-semibold text-danger">{emailHistory.filter((e) => ['failed', 'bounced', 'FAILED', 'BOUNCED'].includes(e.status)).length}</p></CardContent></Card>
                  <Card className="rounded-[12px] border border-line shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Pending</p><p className="mt-1 text-2xl font-semibold text-warn">{emailHistory.filter((e) => ['pending', 'PENDING'].includes(e.status)).length}</p></CardContent></Card>
                </div>
                <Card className="rounded-[12px] border border-line shadow-sm">
                  <CardHeader><CardTitle>Email History</CardTitle><CardDescription>Real send history from the database — Thank-you and Section 18A emails, newest first.</CardDescription></CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="search"
                        aria-label="Search email history"
                        placeholder="Search recipient, donor, donation ID, subject…"
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        className="w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-sm sm:max-w-xs"
                      />
                      <select
                        aria-label="Filter by email type"
                        value={emailTypeFilter}
                        onChange={(e) => setEmailTypeFilter(e.target.value)}
                        className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm"
                      >
                        <option value="">All types</option>
                        <option value="THANK_YOU">Thank you</option>
                        <option value="SECTION_18A">Section 18A</option>
                      </select>
                      <select
                        aria-label="Filter by email status"
                        value={emailStatusFilter}
                        onChange={(e) => setEmailStatusFilter(e.target.value)}
                        className="rounded-[8px] border border-line bg-surface px-3 py-2 text-sm"
                      >
                        <option value="">All statuses</option>
                        <option value="SENT">Sent</option>
                        <option value="FAILED">Failed</option>
                        <option value="PENDING">Pending</option>
                      </select>
                      {(emailSearch || emailTypeFilter || emailStatusFilter) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEmailSearch(''); setEmailTypeFilter(''); setEmailStatusFilter(''); }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    {emailLoading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading email history…</span></div>
                    ) : emailHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center"><Mail className="h-12 w-12 text-muted-foreground/40" /><p className="mt-3 text-sm text-muted-foreground">No emails match. Try clearing search or filters.</p></div>
                    ) : (
                      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Donor</TableHead><TableHead>Donation</TableHead><TableHead>Type</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Sent At</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {emailHistory.map((email) => {
                          const statusConfig = getEmailStatusConfig(email.status);
                          const StatusIcon = statusConfig.icon;
                          const sentAt = emailSentAtOf(email);
                          return (
                            <TableRow key={email.id}>
                              <TableCell className="font-medium">{emailRecipientOf(email)}</TableCell>
                              <TableCell>{email.donor_name || email.donorName || email.recipient_name || email.recipientName || '—'}</TableCell>
                              <TableCell>{emailDonationRefOf(email)}</TableCell>
                              <TableCell><Badge variant="outline" className="rounded-[6px] px-2 py-0 text-[11px]">{normaliseTypeLabel(email.email_type || email.emailType)}</Badge></TableCell>
                              <TableCell className="max-w-[200px] truncate">{email.subject || '—'}</TableCell>
                              <TableCell><Badge variant="outline" className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0 text-[11px] ${statusConfig.bg} ${statusConfig.color}`}><StatusIcon className="h-3 w-3" />{statusConfig.label}</Badge></TableCell>
                              <TableCell>{sentAt ? new Date(sentAt).toLocaleString() : '—'}</TableCell>
                              <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setConfirmResend(email)} disabled={actionLoading === `resend-${email.id}`}>{actionLoading === `resend-${email.id}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}Resend</Button></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody></Table></div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
      <AlertDialog open={!!confirmResend} onOpenChange={() => setConfirmResend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resend Email?</AlertDialogTitle><AlertDialogDescription>This will send the donation email to <strong>{confirmResend?.recipient_email || confirmResend?.recipientEmail || confirmResend?.recipient || 'the recipient'}</strong> again.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => confirmResend && handleResendEmail(confirmResend.id)}>Resend Email</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
