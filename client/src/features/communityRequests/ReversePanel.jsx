// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/ReversePanel.jsx
//
// Reversing a confirmed benevolent request: it was recorded by
// mistake, or the caller never took it away. What went out goes back
// on the shelf through the stock ledger, the request ends as declined,
// and the reason is kept on the request and in the audit log
// (communityRequest.service.js reverse). Managers and admins only.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import DetailPanel from '@/components/ui/detail-panel';
import { fmtQty } from '@/lib/quantity';

const MAX = 500;

export default function ReversePanel({ request, busy = false, error = null, onSubmit, onCancel }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !reason.trim();
  const released = (request.items ?? []).filter((i) => Number(i.quantityReleased) > 0);

  const submit = () => {
    setTouched(true);
    if (missing) return;
    onSubmit(reason.trim());
  };

  return (
    <DetailPanel
      open
      onClose={onCancel}
      eyebrow="Reverse request"
      title={request.callerName || 'An unnamed caller'}
    >
      <FieldGroup>
        {error ? <FieldError>{error}</FieldError> : null}

        <p className="text-sm">
          Use this if the request was recorded by mistake, or the person did not take it.
          What went out goes back into stock and the request is marked declined.
        </p>

        {released.length ? (
          <section className="space-y-1">
            <h3 className="text-sm font-medium">Going back into stock</h3>
            <ul className="text-sm text-muted-foreground">
              {released.map((i) => (
                <li key={i.id}>{fmtQty(i.quantityReleased, i.unit)} {i.productName}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <Field data-invalid={(touched && missing) || undefined}>
          <FieldLabel htmlFor="cr-reverse-reason">Reason</FieldLabel>
          <Textarea
            id="cr-reverse-reason"
            rows={3}
            maxLength={MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Say why, in a few words."
            aria-invalid={(touched && missing) || undefined}
          />
          {touched && missing ? <FieldError>Say why the request is being reversed.</FieldError> : null}
        </Field>

        <Field orientation="horizontal">
          <Button type="button" variant="destructive" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? 'Reversing' : 'Reverse request'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        </Field>
      </FieldGroup>
    </DetailPanel>
  );
}
