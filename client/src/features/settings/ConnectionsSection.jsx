// ─────────────────────────────────────────────────────────────
// client/src/features/settings/ConnectionsSection.jsx
//
// Settings → Connections: every outside service the system depends on
// (the database, Gmail, the links in emails, the scheduled jobs, the
// AI assistant, phone notifications, the volunteer system) and whether
// each is working, checked when the tab opens and again on request.
//
// The worst news first: anything down, then warnings, then what is
// working, then what is simply not set up. Each card says what the
// connection is for, so "off" reads as a choice rather than a fault,
// and offers the fix where there is one.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/ui/status-badge';
import ErrorBanner from '@/components/ui/error-banner';
import { checkConnections } from '../../services/settingsAPI';
import quickbooksAPI from '../../services/quickbooksAPI';
import { ADMIN } from '../../routes/paths';

const STATUS_LABEL = { ok: 'Working', warning: 'Needs a look', down: 'Not working', off: 'Not set up' };
const ORDER = { down: 0, warning: 1, ok: 2, off: 3 };
// Only the admin's own screens: Volunteer events is a manager's.
const SCREENS = { messageHistory: ADMIN.messageHistory };

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-ZA', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
});

// Things a connection's button does that are not a place to go to.
// Connecting is a trip to Intuit and back, so it leaves the page.
const ACTIONS = {
  'quickbooks-connect': () => { window.location.assign(quickbooksAPI.getConnectUrl()); },
  'quickbooks-disconnect': async (recheck) => { await quickbooksAPI.disconnect(); await recheck(); },
};

function Fix({ fix, onSection, onAction }) {
  if (!fix) return null;
  if (fix.action) {
    return <Button type="button" size="sm" variant="outline" onClick={() => onAction(fix.action)}>{fix.label}</Button>;
  }
  if (fix.section) {
    return <Button type="button" size="sm" variant="outline" onClick={() => onSection(fix.section)}>{fix.label}</Button>;
  }
  const to = SCREENS[fix.screen];
  return to ? <Link to={to} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{fix.label}</Link> : null;
}

export default function ConnectionsSection({ onSection }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setResult(await checkConnections());
    } catch (err) {
      setError(err.message || 'Could not check the connections.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkConnections()
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not check the connections.'); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  // Back from signing in to QuickBooks: say how it went, once.
  const [searchParams, setSearchParams] = useSearchParams();
  const quickbooksReturn = searchParams.get('quickbooks');
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!quickbooksReturn) return;
    setNotice(quickbooksReturn === 'connected'
      ? { ok: true, text: 'QuickBooks is connected. Approved purchase orders will now be sent across.' }
      : { ok: false, text: 'QuickBooks was not connected. Try again, and if it keeps failing ask whoever set up the QuickBooks keys.' });
    const next = new URLSearchParams(searchParams);
    next.delete('quickbooks');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickbooksReturn]);

  const [acting, setActing] = useState(false);
  const runAction = async (action) => {
    if (action === 'quickbooks-disconnect'
      && !window.confirm('Disconnect QuickBooks? Approved orders will go back to being emailed to Finance to capture by hand.')) return;
    setActing(true);
    setError(null);
    try {
      await ACTIONS[action]?.(check);
    } catch (err) {
      setError(err.message || 'That did not work. Try again.');
    } finally {
      setActing(false);
    }
  };

  const connections = [...(result?.connections ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const problems = connections.filter((c) => c.status === 'down' || c.status === 'warning').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {checking ? 'Checking…'
            : result ? `${problems ? `${problems} need${problems === 1 ? 's' : ''} attention` : 'Everything set up is working'} · checked at ${fmtTime(result.checkedAt)}`
            : ''}
        </p>
        <Button type="button" variant="outline" size="sm" disabled={checking} onClick={check}>
          <RefreshCw className={checking ? 'animate-spin' : ''} /> Check again
        </Button>
      </div>

      <ErrorBanner message={error} onRetry={check} />
      {notice ? (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm ${notice.ok ? 'bg-good-soft text-good' : 'bg-danger-soft text-danger'}`}>
          {notice.text}
        </p>
      ) : null}

      {!result && checking ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-4xl bg-card shadow-md ring-1 ring-foreground/5" aria-label="Connections">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{c.name}</h3>
                  <StatusBadge kind="connection" status={c.status}>{STATUS_LABEL[c.status] ?? c.status}</StatusBadge>
                </div>
                <p className="text-sm">{c.summary}</p>
                {c.detail ? <p className="break-words text-xs text-muted-foreground">{c.detail}</p> : null}
              </div>
              <div className="shrink-0"><Fix fix={acting ? null : c.fix} onSection={onSection} onAction={runAction} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
