// ─────────────────────────────────────────────────────────────
// client/src/features/settings/components/ConnectionsSection.jsx
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
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/ui/status-badge';
import ErrorBanner from '@/components/ui/error-banner';
import { checkConnections } from '../../../services/settingsAPI';
import { ADMIN } from '../../../routes/paths';

const STATUS_LABEL = { ok: 'Working', warning: 'Needs a look', down: 'Not working', off: 'Not set up' };
const ORDER = { down: 0, warning: 1, ok: 2, off: 3 };
// Only the admin's own screens: Volunteer events is a manager's.
const SCREENS = { messageHistory: ADMIN.messageHistory };

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-ZA', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
});

function Fix({ fix, onSection }) {
  if (!fix) return null;
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
              <div className="shrink-0"><Fix fix={c.fix} onSection={onSection} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
