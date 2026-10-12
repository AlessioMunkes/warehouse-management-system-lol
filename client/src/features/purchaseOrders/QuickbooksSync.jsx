// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/QuickbooksSync.jsx
//
// One line on a purchase order: where it stands with QuickBooks, and a
// button to send it (or send it again).
//
// Renders NOTHING when QuickBooks is not connected, so an installation
// without it looks exactly as it did before. It also renders nothing
// for an order that is already linked: the "Linked to QuickBooks PO
// number" pill above it says that.
//
// "Needs a match" is the state that needs a person. The supplier or a
// product on the order was not found in QuickBooks by name, so nothing
// was created there. The names are listed; once they exist in
// QuickBooks, Send again finishes the job.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { CircleX, Clock, Send, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { getOrderState, sendOrder } from '../../services/quickbooksAPI';

const LOOK = {
  none:        { tone: 'neutral', icon: Clock,         label: 'Not sent to QuickBooks yet' },
  sending:     { tone: 'info',    icon: Send,          label: 'Sending to QuickBooks' },
  needs_match: { tone: 'warn',    icon: TriangleAlert, label: 'Needs a match in QuickBooks' },
  failed:      { tone: 'bad',     icon: CircleX,       label: 'Could not be sent to QuickBooks' },
};

export default function QuickbooksSync({ purchaseOrder: po, canManage, onSynced }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    // A failure to read the status is not worth a red banner on every
    // order: the line is simply left out.
    getOrderState(po.id)
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => { if (!cancelled) setState({ available: false }); });
    return () => { cancelled = true; };
  }, [po.id, po.status, po.quickbooksPoId]);

  if (!state?.available) return null;
  if (po.quickbooksPoId || state.state === 'synced') return null;
  // Nothing to send until a manager has approved it.
  if (po.status === 'pending' || po.status === 'returned') return null;

  const look = LOOK[busy ? 'sending' : state.state] ?? LOOK.none;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await sendOrder(po.id);
      setState(next);
      if (next.state === 'synced') onSynced?.(next.quickbooksPoId);
    } catch (err) {
      setError(err.message || 'Could not send this order to QuickBooks.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={look.tone} icon={look.icon}>{look.label}</StatusBadge>
        {canManage ? (
          <Button type="button" size="sm" variant="outline" onClick={send} disabled={busy} loading={busy}>
            {state.state === 'none' ? 'Send to QuickBooks' : 'Send again'}
          </Button>
        ) : null}
      </div>
      {!busy && state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
      {error ? <p role="alert" className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
