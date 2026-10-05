// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/components/PhoneAlerts.jsx
//
// "Alerts on this phone", at the top of the worker's bell: turns phone
// notifications for new slips on the floor on or off (see
// phoneAlerts.js).
//
// When a phone can't get alerts it says why and what to do, rather
// than showing a button that does nothing.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  currentPhoneSubscription, phoneAlertSupport, turnOffPhoneAlerts, turnOnPhoneAlerts,
} from '../phoneAlerts';

const WHY_NOT = {
  'install-first': 'On an iPhone, alerts only work in the installed app: tap Share, then “Add to Home Screen”, and open the app from there.',
  unsupported: 'This browser can’t show alerts. Use Chrome on Android, or the installed app on an iPhone.',
  blocked: 'Alerts are blocked for this app. Allow notifications for it in your phone’s settings, then come back here.',
  'no-worker': 'Alerts aren’t ready yet. Close the app, open it again and try once more.',
  'server-off': 'Phone alerts haven’t been set up on the server yet. Ask a manager.',
};

export default function PhoneAlerts() {
  const [support, setSupport] = useState(() => phoneAlertSupport());
  const [on, setOn] = useState(null);           // null until checked
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let cancelled = false;
    currentPhoneSubscription()
      .then((s) => { if (!cancelled) setOn(Boolean(s)); })
      .catch(() => { if (!cancelled) setOn(false); });
    return () => { cancelled = true; };
  }, []);

  const turnOn = async () => {
    setBusy(true); setProblem(null);
    try {
      const result = await turnOnPhoneAlerts();
      if (result.ok) setOn(true);
      else if (result.reason !== 'dismissed') setProblem(result.reason);
    } catch {
      setProblem('no-worker');
    } finally {
      setSupport(phoneAlertSupport());
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true); setProblem(null);
    try { await turnOffPhoneAlerts(); setOn(false); } catch { /* stays as it was */ } finally { setBusy(false); }
  };

  const reason = problem ?? (['install-first', 'unsupported', 'blocked'].includes(support) ? support : null);

  return (
    <div className="flex items-start gap-3 border-b bg-muted/30 px-4 py-3">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${on ? 'bg-brand text-on-brand' : 'bg-muted text-muted-foreground'}`} aria-hidden="true">
        <BellRing className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Alerts on this phone
          {on ? <span className="ml-2 rounded-full bg-good-soft px-1.5 py-px text-[11px] font-semibold text-good">On</span> : null}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {reason ? WHY_NOT[reason]
            : on ? 'You’ll get a notification when new pallets are put on the floor.'
              : 'Get a notification when new pallets are put on the floor, even with the app closed.'}
        </p>
      </div>
      {on === null ? null : on ? (
        <Button size="sm" variant="ghost" onClick={turnOff} disabled={busy}>Turn off</Button>
      ) : support === 'ask' || support === 'granted' ? (
        <Button size="sm" onClick={turnOn} disabled={busy} loading={busy}>{busy ? '…' : 'Turn on'}</Button>
      ) : null}
    </div>
  );
}
