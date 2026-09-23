// ─────────────────────────────────────────────────────────────
// client/src/pages/GmailSettingsPage.jsx
//
// Admin screen for the donation Gmail integration: connect /
// disconnect the organisation Gmail account, see connection
// status and send a test email.
//
// The OAuth connect button is a full page navigation (not fetch):
// Google's consent screen takes over the tab, then redirects back
// to /api/gmail/callback on the server, which bounces to this page
// with ?gmail=connected|error.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
//import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import gmailAPI from '../services/gmailAPI';
import financeAPI from '../services/financeAPI';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function GmailSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [financeRecipientEmail, setFinanceRecipientEmail] = useState('');
  const [savingFinanceRecipient, setSavingFinanceRecipient] = useState(false);
  const [sendingFinanceLink, setSendingFinanceLink] = useState(false);
  const oauthFeedbackShown = useRef(false);

  // Initial load. A separate effect refreshes the status after the OAuth
  // round trip lands back on this page with ?gmail=connected.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setStatusError('');
      try {
        const nextStatus = await gmailAPI.getStatus();
        if (!cancelled) {
          setStatus(nextStatus);
          // Pre-fill the display name field from the stored value.
          if (nextStatus?.displayName) {
            setDisplayName(nextStatus.displayName);
          }
          try {
            const financeSettings = await financeAPI.getFinanceEmailSettings();
            if (!cancelled) setFinanceRecipientEmail(financeSettings?.recipientEmail || '');
          } catch {
            if (!cancelled) setFeedback({ type: 'error', message: 'Could not load Finance email settings.' });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(null);
          setStatusError(error.message || 'Could not load Gmail connection status.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // OAuth callback feedback — derived directly from the query parameter,
  // never stored in state. The code/state parameters are never kept; only
  // the success/failure flag is read, then the query is cleaned up.
  const gmailResult = searchParams.get('gmail');
  const oauthFeedback = gmailResult === 'connected'
    ? { type: 'success', message: 'Gmail connected.' }
    : gmailResult === 'error'
      ? { type: 'error', message: 'Could not complete Gmail connection.' }
      : null;

  // Clear the ?gmail= query parameter after a short delay so the message can
  // be read. A ref guards against re-firing: setSearchParams changes
  // searchParams (a dep), so without the guard the effect would run again.
  useEffect(() => {
    if (!gmailResult || oauthFeedbackShown.current) return;
    oauthFeedbackShown.current = true;

    const timeout = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('gmail');
        return next;
      }, { replace: true });
    }, 5000);

    return () => clearTimeout(timeout);
  }, [gmailResult, setSearchParams]);

  // The feedback to display: OAuth callback feedback takes precedence over
  // action-based feedback (e.g. from disconnect).
  const displayFeedback = oauthFeedback || feedback;

  const navigateToConnect = () => {
    window.location.assign(gmailAPI.getConnectUrl());
  };

  const handleDisconnect = async () => {
    setConfirmDisconnectOpen(false);
    try {
      await gmailAPI.disconnect();
      setStatus({ connected: false });
      setDisplayName('');
      setFeedback({ type: 'success', message: 'Gmail disconnected.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Could not disconnect Gmail.' });
    }
  };

  const handleSaveDisplayName = async (event) => {
    event.preventDefault();
    if (!displayName.trim()) return;
    setSavingDisplayName(true);
    setFeedback(null);
    try {
      const result = await gmailAPI.saveDisplayName(displayName.trim());
      setFeedback({ type: 'success', message: 'Display name saved.' });
      if (result?.data) {
        setStatus((prev) => (prev ? { ...prev, displayName: result.data.displayName } : prev));
      }
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Could not save display name.' });
    } finally {
      setSavingDisplayName(false);
    }
  };

  const sendTestEmail = async (event) => {
    event.preventDefault();
    setSendingTest(true);
    try {
      await gmailAPI.sendTestEmail({ to: recipientEmail });
      setFeedback({ type: 'success', message: 'Test email sent.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Could not send test email.' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveFinanceRecipient = async (event) => {
    event.preventDefault();
    setSavingFinanceRecipient(true);
    setFeedback(null);
    try {
      const result = await financeAPI.saveFinanceEmailSettings({
        recipientEmail: financeRecipientEmail.trim(),
      });
      setFinanceRecipientEmail(result?.recipientEmail || financeRecipientEmail.trim());
      setFeedback({ type: 'success', message: 'Finance recipient saved.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Could not save Finance recipient.' });
    } finally {
      setSavingFinanceRecipient(false);
    }
  };

  const handleSendFinanceReportLink = async () => {
    if (!financeRecipientEmail.trim()) {
      setFeedback({
        type: 'error',
        message: 'Save a Finance recipient email before sending the report link.',
      });
      return;
    }

    setSendingFinanceLink(true);
    setFeedback(null);
    try {
      await financeAPI.sendFinanceReportLink();
      setFeedback({ type: 'success', message: 'Finance report link sent.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Could not send Finance report link.' });
    } finally {
      setSendingFinanceLink(false);
    }
  };

  const connected = Boolean(status?.connected);

  return (
    <div className="min-h-screen bg-canvas">
   
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {displayFeedback && (
          <div
            role="status"
            className={
              displayFeedback.type === 'success'
                ? 'rounded-md border border-good bg-good-soft px-4 py-3 text-sm text-good'
                : 'rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger'
            }
          >
            {displayFeedback.message}
          </div>
        )}

        <Card className="rounded-lg border border-line shadow-sm">
          <CardHeader>
            <CardTitle>Gmail Connection</CardTitle>
            <CardDescription>
              {loading
                ? 'Checking Gmail connection status...'
                : connected
                  ? 'Donation emails are ready to send through the connected account.'
                  : 'Connect an organisation Gmail account so the Donation system can automatically send thank-you emails.'}
            </CardDescription>
            <CardAction>
              {connected ? <Badge>Connected</Badge> : <Badge variant="outline">Not Connected</Badge>}
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Checking Gmail connection status...</p>
            ) : statusError ? (
              <p className="text-sm text-danger">{statusError}</p>
            ) : (
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="font-medium text-muted-foreground">Gmail Status</dt>
                  <dd className="mt-1">
                    {connected ? (
                      <Badge className="bg-good-soft text-good hover:bg-good-soft">Connected</Badge>
                    ) : (
                      <Badge variant="outline" className="text-danger border-danger">Disconnected</Badge>
                    )}
                  </dd>
                </div>
                {connected && (
                  <>
                    <div>
                      <dt className="font-medium text-muted-foreground">Connected Email Address</dt>
                      <dd className="mt-1 break-words text-ink">{status.email || 'Unknown'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">Display Name</dt>
                      <dd className="mt-1">
                        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={handleSaveDisplayName}>
                          <div className="flex-1">
                            <Label htmlFor="displayName" className="sr-only">Display Name</Label>
                            <Input
                              id="displayName"
                              type="text"
                              value={displayName}
                              onChange={(event) => setDisplayName(event.target.value)}
                              placeholder="e.g. Ladles of Love"
                              maxLength={255}
                            />
                          </div>
                          <Button type="submit" variant="secondary" disabled={savingDisplayName || !displayName.trim()}>
                            {savingDisplayName ? 'Saving...' : 'Save Display Name'}
                          </Button>
                        </form>
                        <p className="mt-1 text-xs text-muted-foreground">
                          This name appears as the sender in donation emails.
                        </p>
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            )}

            <div className="flex gap-2">
              {connected ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setConfirmDisconnectOpen(true)}>
                    Disconnect Gmail
                  </Button>
                  <Button type="button" variant="secondary" onClick={navigateToConnect}>
                    Reconnect Gmail
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={navigateToConnect}>
                  Connect Gmail
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-line shadow-sm">
          <CardHeader>
            <CardTitle>Send Test Email</CardTitle>
            <CardDescription>
              Verify that the connected account can send Donation emails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={sendTestEmail}>
              <div className="flex-1 space-y-2">
                <Label htmlFor="recipientEmail">Recipient email</Label>
                <Input
                  id="recipientEmail"
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="name@example.org"
                  required
                />
              </div>
              <Button type="submit" disabled={sendingTest || !connected}>
                {sendingTest ? 'Sending...' : 'Send Test Email'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-line shadow-sm">
          <CardHeader>
            <CardTitle>Finance Report Link</CardTitle>
            <CardDescription>
              Save the Finance recipient and send a secure read-only report link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={handleSaveFinanceRecipient}>
              <div className="flex-1 space-y-2">
                <Label htmlFor="financeRecipientEmail">Finance recipient email</Label>
                <Input
                  id="financeRecipientEmail"
                  type="email"
                  value={financeRecipientEmail}
                  onChange={(event) => setFinanceRecipientEmail(event.target.value)}
                  placeholder="finance@example.org"
                  required
                />
              </div>
              <Button type="submit" variant="secondary" disabled={savingFinanceRecipient || !financeRecipientEmail.trim()}>
                {savingFinanceRecipient ? 'Saving...' : 'Save Finance Recipient'}
              </Button>
            </form>
            <Button
              type="button"
              onClick={handleSendFinanceReportLink}
              disabled={sendingFinanceLink || !connected}
            >
              {sendingFinanceLink ? 'Sending...' : 'Send Finance Report Link'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDisconnectOpen} onOpenChange={setConfirmDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
            <AlertDialogDescription>
              Donation thank-you emails will stop sending until the account is reconnected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

