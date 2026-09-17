// ─────────────────────────────────────────────────────────────
// client/src/features/users/components/PendingInvitesSection.jsx
//
// Deliberately its own section, not unioned into the user table below
// — a pending invite is not an account yet (see migration 023's
// header: no users row exists until accept). Rows here would not
// survive being fed into COLUMNS in UserDirectoryPage.jsx anyway —
// an invite has no username, no isActive, no id in the users table.
//
// "Copy link" IS a resend, not a re-read of the same link. No raw
// token is ever stored server-side (only its hash), so there is
// nothing to fetch back for an existing row — the only way to get a
// copyable link for a pending invite is to mint a fresh one, which is
// exactly what resend does. Both buttons call the same endpoint; they
// exist as two buttons because "I want the link again" and "please
// resend the email" are different intents even though they resolve
// to the same server call.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, Copy, Ban } from 'lucide-react';

const ROLE_LABELS = {
  warehouse_worker: 'Worker',
  manager:           'Manager',
  admin:             'Admin',
};

const relativeExpiry = (iso) => {
  if (!iso) return 'unknown';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return `in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.max(1, Math.round(ms / (1000 * 60 * 60)));
  return `in ${hours} hour${hours === 1 ? '' : 's'}`;
};

export default function PendingInvitesSection({
  invites,
  loading,
  busyId,
  onResend,
  onCopyLink,
  onRevoke,
}) {
  const [revokeTarget, setRevokeTarget] = useState(null);

  if (loading) return null;
  if (!invites.length) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">
          Pending invites ({invites.length})
        </h2>

        <ul className="divide-y divide-border">
          {invites.map((invite) => {
            const isBusy = busyId === invite.id;
            return (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{invite.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {ROLE_LABELS[invite.role] ?? invite.role}
                    {' · sent '}
                    {invite.lastSentAt ? new Date(invite.lastSentAt).toLocaleDateString() : 'unknown'}
                    {' · expires '}
                    {relativeExpiry(invite.expiresAt)}
                    {invite.resendCount > 0 ? ` · resent ${invite.resendCount}×` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button" variant="outline" size="sm"
                    disabled={isBusy}
                    onClick={() => onCopyLink(invite)}
                  >
                    {isBusy ? <Loader2 className="animate-spin" /> : <Copy />}
                    Copy link
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm"
                    disabled={isBusy}
                    onClick={() => onResend(invite)}
                  >
                    {isBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Resend
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm"
                    disabled={isBusy}
                    onClick={() => setRevokeTarget(invite)}
                    className="border-brand text-brand hover:bg-brand hover:text-on-brand"
                  >
                    <Ban />
                    Revoke
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent className="gap-4 rounded-lg p-5 data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-md">
          <AlertDialogHeader className="gap-1">
            <AlertDialogTitle className="text-base">Revoke this invite?</AlertDialogTitle>
            <AlertDialogDescription className="break-all font-medium text-foreground">
              {revokeTarget?.email}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            The link already sent will stop working immediately. This cannot be undone — send a new invite instead.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              className="border-brand text-brand hover:bg-brand hover:text-on-brand"
              onClick={() => { const target = revokeTarget; setRevokeTarget(null); onRevoke(target); }}
            >
              <Ban />
              Revoke invite
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
