// ─────────────────────────────────────────────────────────────
// client/src/pages/Section18AManagementPage.jsx
// Route: /admin/section-18a-management
//
// Admin page for managing Section 18A tax certificates and email
// integration. Includes certificate queue, email history, and
// certificate settings.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  FileText, Mail, Settings, Download, RefreshCw, Send,
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2,
} from 'lucide-react';
import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import donationManagementAPI from '../services/donationManagementAPI';
import CertificateSettings from '../features/donationManagement/components/CertificateSettings';

const TABS = [
  { id: 'certificates', label: 'Certificate Queue', icon: FileText, description: 'View and manage Section 18A tax certificates for donations.' },
  { id: 'emails', label: 'Email Integration', icon: Mail, description: 'Track and resend Section 18A certificate emails.' },
  { id: 'settings', label: 'Settings', icon: Settings, description: 'Configure certificate templates and email defaults.' },
];

const EMAIL_STATUS_CONFIG = {
  sent: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Sent' },
  delivered: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Delivered' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
  pending: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Pending' },
  bounced: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Bounced' },
  SENT: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Sent' },
  DELIVERED: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Delivered' },
  FAILED: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
  PENDING: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Pending' },
  BOUNCED: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Bounced' },
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
  const [confirmGenerate, setConfirmGenerate] = useState(null);
  const [emailSearch, setEmailSearch] = useState('');
  const [emailTypeFilter, setEmailTypeFilter] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState('');
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

  const handleGenerateCertificate = async (donationId) => {
    setActionLoading(`generate-${donationId}`);
    setConfirmGenerate(null);
    setFeedback(null);
    try {
      await donationManagementAPI.generateCertificate(donationId);
      setFeedback({ type: 'success', message: 'Certificate generated successfully.' });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to generate certificate.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadCertificate = (donationId) => {
    donationManagementAPI.downloadCertificate(donationId);
  };

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

  return (
    <div className="min-h-screen bg-[#f8f5f2] text-[#2b3336] font-['Montserrat',sans-serif]">
      <TopNavbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-medium">Section 18A Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage tax certificates, email delivery, and certificate settings.</p>
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
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`} role="alert">
            {feedback.message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>
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
                <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
                  <CardHeader>
                    <CardTitle>Certificate Queue</CardTitle>
                    <CardDescription>{certificateQueue.length} donation{certificateQueue.length !== 1 ? 's' : ''} in the Section 18A certificate queue.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {certificateQueue.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/40" />
                        <p className="mt-3 text-sm text-muted-foreground">No certificates in the queue.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow><TableHead>Donation</TableHead><TableHead>Donor</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
                          </TableHeader>
                          <TableBody>
                            {certificateQueue.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.reference || item.id}</TableCell>
                                <TableCell>{item.donorName || item.donor_name || '—'}</TableCell>
                                <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : item.date || '—'}</TableCell>
                                <TableCell><Badge variant={item.certificateGenerated || item.certificate_generated ? 'default' : 'outline'} className="rounded-[6px] px-2 py-0 text-[11px]">{item.certificateGenerated || item.certificate_generated ? 'Generated' : 'Pending'}</Badge></TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    {(item.certificateGenerated || item.certificate_generated) ? (<>
                                      <Button variant="outline" size="sm" onClick={() => handleDownloadCertificate(item.id)}><Download className="mr-1 h-3 w-3" />Download</Button>
                                      <Button variant="ghost" size="sm" onClick={() => setConfirmGenerate(item)} disabled={actionLoading === `generate-${item.id}`}>
                                        {actionLoading === `generate-${item.id}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}Regenerate
                                      </Button>
                                    </>) : (
                                      <Button size="sm" onClick={() => setConfirmGenerate(item)} disabled={actionLoading === `generate-${item.id}`}>
                                        {actionLoading === `generate-${item.id}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileText className="mr-1 h-3 w-3" />}Generate
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
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
                  <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Total Emails</p><p className="mt-1 text-2xl font-semibold">{emailHistory.length}</p></CardContent></Card>
                  <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Sent</p><p className="mt-1 text-2xl font-semibold text-green-600">{emailHistory.filter((e) => ['sent', 'delivered', 'SENT', 'DELIVERED'].includes(e.status)).length}</p></CardContent></Card>
                  <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Failed</p><p className="mt-1 text-2xl font-semibold text-red-600">{emailHistory.filter((e) => ['failed', 'bounced', 'FAILED', 'BOUNCED'].includes(e.status)).length}</p></CardContent></Card>
                  <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm"><CardContent className="pt-4"><p className="text-sm font-medium text-muted-foreground">Pending</p><p className="mt-1 text-2xl font-semibold text-amber-600">{emailHistory.filter((e) => ['pending', 'PENDING'].includes(e.status)).length}</p></CardContent></Card>
                </div>
                <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
                  <CardHeader><CardTitle>Email History</CardTitle><CardDescription>Real send history from the database — Thank-you and Section 18A emails, newest first.</CardDescription></CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="search"
                        aria-label="Search email history"
                        placeholder="Search recipient, donor, donation ID, subject…"
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        className="w-full rounded-[8px] border border-[#e9e3dd] bg-white px-3 py-2 text-sm sm:max-w-xs"
                      />
                      <select
                        aria-label="Filter by email type"
                        value={emailTypeFilter}
                        onChange={(e) => setEmailTypeFilter(e.target.value)}
                        className="rounded-[8px] border border-[#e9e3dd] bg-white px-3 py-2 text-sm"
                      >
                        <option value="">All types</option>
                        <option value="THANK_YOU">Thank you</option>
                        <option value="SECTION_18A">Section 18A</option>
                      </select>
                      <select
                        aria-label="Filter by email status"
                        value={emailStatusFilter}
                        onChange={(e) => setEmailStatusFilter(e.target.value)}
                        className="rounded-[8px] border border-[#e9e3dd] bg-white px-3 py-2 text-sm"
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
            {tab === 'settings' && (
              <div className="mt-6">
                <CertificateSettings />
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
      <AlertDialog open={!!confirmGenerate} onOpenChange={() => setConfirmGenerate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirmGenerate?.certificateGenerated || confirmGenerate?.certificate_generated ? 'Regenerate Certificate?' : 'Generate Certificate?'}</AlertDialogTitle><AlertDialogDescription>{confirmGenerate?.certificateGenerated || confirmGenerate?.certificate_generated ? 'This will create a new Section 18A certificate and replace the existing one.' : 'This will generate a Section 18A tax certificate for this donation.'}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => confirmGenerate && handleGenerateCertificate(confirmGenerate.id)}>{confirmGenerate?.certificateGenerated || confirmGenerate?.certificate_generated ? 'Regenerate' : 'Generate'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
