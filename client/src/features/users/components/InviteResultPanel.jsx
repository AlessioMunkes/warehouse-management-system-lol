// ─────────────────────────────────────────────────────────────
// client/src/features/users/components/InviteResultPanel.jsx
//
// THE LINK IS THE ARTEFACT. Shown after creating or resending an
// invite — the one and only moment the raw token exists anywhere
// outside its hash in the database. Once this panel is dismissed the
// link is gone for good; getting another one means Resend, which
// invalidates this one.
//
// SEND-STATUS HONESTY. `result.email` is undefined until the
// email-sending phase is wired up server-side — see
// userInviteAPI.js's toInviteWithLink. Three distinct states, not
// two: no attempt (undefined), sent, and failed. The copy for each is
// written so nobody reads "sent" when nothing was attempted, or
// "failed" as if the invite itself failed — the invite exists either
// way, independent of whether the email went anywhere.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Check, Copy, Mail, MailWarning } from 'lucide-react';
import { useToast } from '@/components/ui/toastContext';
import { copyToClipboard } from '@/lib/clipboard';

const ROLE_LABELS = {
  warehouse_worker: 'Worker',
  manager:           'Manager',
  admin:             'Admin',
};

const SendStatus = ({ email }) => {
  if (email === undefined) {
    // No send has been attempted at all — say so plainly rather than
    // implying one was tried.
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        Not emailed automatically yet. Copy the link below and send it however works best.
      </p>
    );
  }
  if (email?.sent) {
    return (
      <p className="flex items-center gap-2 text-sm text-good">
        <Mail className="size-4" />
        Emailed to the address above.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-danger">
      <MailWarning className="size-4" />
      {`Could not send the email${email?.error ? ` (${email.error})` : ''}. The link below still works — share it another way.`}
    </p>
  );
};

export default function InviteResultPanel({ result, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  if (!result) return null;
  const { invite, url, email } = result;

  const copy = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast({ variant: 'success', title: 'Link copied' });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({ variant: 'error', title: 'Could not copy the link', description: 'Select the text and copy it manually.' });
    }
  };

  return (
    <div className="rounded-[8px] border border-info bg-info-soft p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            Invite ready for {invite.email}
          </p>
          <p className="text-sm text-muted-foreground">
            {ROLE_LABELS[invite.role] ?? invite.role} · expires{' '}
            {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'in 7 days'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
      </div>

      <SendStatus email={email} />

      <Field>
        <FieldLabel htmlFor="invite-link" className="sr-only">Invite link</FieldLabel>
        <div className="flex gap-2">
          <Input id="invite-link" readOnly value={url} onFocus={(e) => e.target.select()} />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      </Field>
    </div>
  );
}
