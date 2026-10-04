// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/components/DeclinePanel.jsx
//
// Declining a benevolent request, awaiting approval or approved. The
// reason is required and is saved on the request. Declining an approved
// request releases the stock that was set aside for it.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import DetailPanel from '@/components/ui/detail-panel';

const MAX = 500;

export default function DeclinePanel({ request, busy = false, error = null, onSubmit, onCancel }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !reason.trim();

  const submit = () => {
    setTouched(true);
    if (missing) return;
    onSubmit(reason.trim());
  };

  return (
    <DetailPanel
      open
      onClose={onCancel}
      eyebrow="Decline request"
      title={request.callerName || 'An unnamed caller'}
    >
      <FieldGroup>
        {error ? <FieldError>{error}</FieldError> : null}

        <p className="whitespace-pre-line text-sm text-muted-foreground">{request.itemsRequested}</p>

        {request.outcome === 'approved' ? (
          <p className="text-sm">The stock set aside for this request will be released.</p>
        ) : null}

        <Field data-invalid={(touched && missing) || undefined}>
          <FieldLabel htmlFor="cr-decline-reason">Reason</FieldLabel>
          <Textarea
            id="cr-decline-reason"
            rows={3}
            maxLength={MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Say why, in a few words."
            aria-invalid={(touched && missing) || undefined}
          />
          {touched && missing ? <FieldError>Say why the request is declined.</FieldError> : null}
        </Field>

        <Field orientation="horizontal">
          <Button type="button" variant="destructive" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? 'Declining' : 'Decline request'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        </Field>
      </FieldGroup>
    </DetailPanel>
  );
}
