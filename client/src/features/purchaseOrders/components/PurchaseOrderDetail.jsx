// ─────────────────────────────────────────────────────────────
// features/purchaseOrders/components/PurchaseOrderDetail.jsx
//
// One purchase order in the right-hand panel, opened from its row —
// the shared DetailPanel every manager list now uses.
//
// The received column is the whole point of the panel. It comes from
// delivery_note_items summed across every delivery note logged against
// the line, which is how BR-07A partial instalments work without a
// separate receipts table — one PO, many delivery notes.
//
// ACTIONS
//   Approve           pending only
//   Record follow-up  any order still expecting goods; needs a reason,
//                     which shows on the order from then on (the same
//                     status_reason a Returned order carries)
//   Reopen            a followed-up order back to Approved, so it can be
//                     received against again — follow_up_required is
//                     not an open status, and without this it would be
//                     a dead end
//   Edit / Delete     pending only — see purchaseOrder.service.js's guard
//
// The page mounts this with key={po.id}, so a draft reason or
// QuickBooks reference never carries over to the next order opened.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import StatusBadge from '@/components/ui/status-badge';
import DetailPanel from '@/components/ui/detail-panel';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { BadgeCheck, Mail, MailCheck, MailX, Pencil, RotateCcw, CopyPlus, Trash2, TriangleAlert } from 'lucide-react';
import { RECEIVABLE_PO_STATUSES } from '@/services/purchaseOrderAPI';
import PurchaseOrderTimeline from './PurchaseOrderTimeline';
import PhotoStrip from '@/components/ui/photo-strip';

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

const money = (value) =>
  `R ${Number(value || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

const Section = ({ title, children }) => (
  <section>
    <h3 className="mb-2 text-sm font-medium">{title}</h3>
    {children}
  </section>
);

export default function PurchaseOrderDetail({
  purchaseOrder: po, canManage, onApprove, onRecordFollowUp, onReopen, onCreateFollowUp, onOpenOrder, onSetQuickbooksRef,
  onResendFinanceEmail, onEdit, onDelete, onClose,
}) {
  const pending = po.status === 'pending';
  const canEditOrDelete = canManage && pending;
  // Approved and still expecting goods: the only orders a follow-up
  // means anything on. Not a pending one — reopening a followed-up order
  // returns it to Approved, which would skip the approval.
  const canFollowUp = canManage && !pending && RECEIVABLE_PO_STATUSES.includes(po.status);

  // Something is still owed on it: only then is there anything for a
  // follow-up order to carry.
  const outstanding = po.items.some((l) => l.receivedToDate < l.expectedQuantity);
  const followUps = po.followUpOrders ?? [];
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const createFollowUp = async () => {
    setCreatingFollowUp(true);
    try {
      await onCreateFollowUp();
    } finally {
      setCreatingFollowUp(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]           = useState(false);

  // Same success-boolean convention throughout: the page owns the
  // try/catch and the error banner; this only decides whether to close
  // the editor (success) or leave it open with the draft (failure).
  const runDelete = async () => {
    setDeleting(true);
    try {
      const ok = await onDelete();
      if (ok) setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const [followingUp, setFollowingUp] = useState(false);
  const [reason, setReason]           = useState('');
  const [followBusy, setFollowBusy]   = useState(false);
  const saveFollowUp = async () => {
    setFollowBusy(true);
    try {
      const ok = await onRecordFollowUp(reason.trim());
      if (ok) { setFollowingUp(false); setReason(''); }
    } finally {
      setFollowBusy(false);
    }
  };

  // The QBO reference is usually only known after this PO has been
  // raised here and then entered into QuickBooks separately, so it
  // needs an edit path the other facts don't.
  const [editingQbo, setEditingQbo] = useState(false);
  const [qboDraft, setQboDraft]     = useState(po.quickbooksPoId || '');
  const [qboBusy, setQboBusy]       = useState(false);
  const saveQbo = async () => {
    setQboBusy(true);
    try {
      const ok = await onSetQuickbooksRef(qboDraft.trim());
      if (ok) setEditingQbo(false);
    } finally {
      setQboBusy(false);
    }
  };

  // Finance email: the stored status is 'sent' | 'failed' | null. Null
  // means no attempt has been recorded — "Not sent", the normal state
  // when no recipient was saved or sending is off.
  const [resending, setResending] = useState(false);
  const emailFailed = po.financeEmailStatus === 'failed';
  const emailSent   = po.financeEmailStatus === 'sent';
  const canResend   = canManage && !emailSent && Boolean(onResendFinanceEmail);
  const resend = async () => {
    setResending(true);
    try {
      await onResendFinanceEmail();
    } finally {
      setResending(false);
    }
  };

  // From the order's own lines: the single-order endpoint does not
  // carry the list's line_count / estimated_value summaries.
  const received = po.items.filter((l) => l.receivedToDate >= l.expectedQuantity).length;
  const estimated = po.items.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.expectedQuantity, 0);

  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={`${po.supplierName} · ${po.items.length} ${po.items.length === 1 ? 'line' : 'lines'} · ${money(estimated)} estimated`}
      title={po.poNumber}
      badges={<StatusBadge kind="purchaseOrder" status={po.status}>{po.statusLabel}</StatusBadge>}
      actions={canManage ? (
        <>
          {pending ? (
            <Button type="button" size="sm" onClick={onApprove}>
              <BadgeCheck /> Approve
            </Button>
          ) : null}
          {/* What to do about a short delivery: order the rest (the usual
              answer), or reopen this order if the supplier will bring the
              rest against it. */}
          {po.status === 'follow_up_required' && outstanding && onCreateFollowUp ? (
            <Button type="button" size="sm" onClick={createFollowUp} disabled={creatingFollowUp} loading={creatingFollowUp}>
              <CopyPlus /> {creatingFollowUp ? 'Creating…' : 'Create follow-up order'}
            </Button>
          ) : null}
          {po.status === 'follow_up_required' ? (
            <Button type="button" variant="outline" size="sm" onClick={onReopen}>
              <RotateCcw /> Reopen for receiving
            </Button>
          ) : null}
          {canFollowUp && !followingUp ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setFollowingUp(true)}>
              <TriangleAlert /> Record follow-up
            </Button>
          ) : null}
          {canEditOrDelete ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                <Pencil /> Edit
              </Button>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setConfirmDelete(true)}
                className="border-brand text-brand hover:bg-brand hover:text-white"
              >
                <Trash2 /> Delete
              </Button>
            </>
          ) : null}
        </>
      ) : null}
    >
      {followingUp ? (
        <section className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="po-follow-up">What needs following up with {po.supplierName}?</Label>
          <Textarea
            id="po-follow-up" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Delivery two weeks late; supplier not answering"
            maxLength={500} disabled={followBusy}
          />
          <p className="text-xs text-muted-foreground">
            The order moves to Follow-up required and stops being offered for receiving until someone reopens it.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!reason.trim() || followBusy} onClick={saveFollowUp} loading={followBusy}>
              {followBusy ? 'Saving…' : 'Save follow-up'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={followBusy}
              onClick={() => { setFollowingUp(false); setReason(''); }}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {/* Mandatory on Returned (BR-07B, enforced in SQL) and on a
          recorded follow-up — so if there is one, it is on screen. */}
      {po.statusReason ? (
        <div className="rounded-[4px] border-2 border-brand bg-danger-soft p-3 text-sm">
          <span className="font-semibold">{po.statusLabel}:</span> {po.statusReason}
        </div>
      ) : null}

      {/* How this order is tied to others: the one it follows, and any
          raised to follow it. */}
      {po.followUpOf || followUps.length > 0 ? (
        <div className="space-y-1 rounded-lg border p-3 text-sm">
          {po.followUpOf ? (
            <p>
              Follow-up to{' '}
              <button type="button" className="font-medium underline underline-offset-2" onClick={() => onOpenOrder?.(po.followUpOf.id)}>
                {po.followUpOf.poNumber}
              </button>
              . Receiving this in full completes both.
            </p>
          ) : null}
          {followUps.map((o) => (
            <p key={o.id}>
              The rest is on follow-up order{' '}
              <button type="button" className="font-medium underline underline-offset-2" onClick={() => onOpenOrder?.(o.id)}>
                {o.poNumber}
              </button>
              {' '}({o.statusLabel.toLowerCase()}).
            </p>
          ))}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Expected</dt>
          <dd>{fmtDate(po.expectedDeliveryDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Received</dt>
          <dd className="tabular-nums">{received} of {po.items.length} lines</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">QuickBooks PO number</dt>
          {editingQbo ? (
            <dd className="flex items-center gap-2">
              <Input
                value={qboDraft} onChange={(e) => setQboDraft(e.target.value)}
                placeholder="QuickBooks PO number" maxLength={50} className="h-8" disabled={qboBusy}
                aria-label="QuickBooks PO number"
              />
              <Button type="button" size="sm" onClick={saveQbo} disabled={qboBusy}>Save number</Button>
              <Button
                type="button" variant="ghost" size="sm" disabled={qboBusy}
                onClick={() => { setQboDraft(po.quickbooksPoId || ''); setEditingQbo(false); }}
              >
                Discard
              </Button>
            </dd>
          ) : (
            <dd className="flex items-center gap-1">
              {/* Unlinked is the normal state until Finance has entered
                  the order, so it reads as neutral, not as a problem. */}
              <StatusBadge tone="neutral" className="max-w-full whitespace-normal break-all">
                {po.quickbooksPoId ? `Linked to QuickBooks PO number ${po.quickbooksPoId}` : 'Not linked to QuickBooks yet'}
              </StatusBadge>
              {canManage ? (
                <Button
                  type="button" variant="ghost" size="icon-sm"
                  onClick={() => setEditingQbo(true)} aria-label="Edit QuickBooks PO number"
                >
                  <Pencil />
                </Button>
              ) : null}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Finance email</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {emailSent ? (
              <StatusBadge tone="neutral" icon={MailCheck}>
                Sent to Finance{po.financeEmailAttemptedAt ? ` · ${fmtDateTime(po.financeEmailAttemptedAt)}` : ''}
              </StatusBadge>
            ) : emailFailed ? (
              <StatusBadge tone="warn" icon={MailX}>Send failed</StatusBadge>
            ) : (
              <StatusBadge tone="neutral" icon={Mail}>Not sent</StatusBadge>
            )}
            {emailFailed && po.financeEmailError ? (
              <span className="text-xs text-muted-foreground">{po.financeEmailError}</span>
            ) : null}
            {canResend ? (
              <Button type="button" variant="outline" size="sm" onClick={resend} disabled={resending}>
                {resending ? 'Sending…' : 'Resend to Finance'}
              </Button>
            ) : null}
          </dd>
        </div>
      </dl>

      <Section title="Lines">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((line) => {
                const outstanding = line.expectedQuantity - line.receivedToDate;
                return (
                  <TableRow key={line.id}>
                    <TableCell className="whitespace-normal">
                      {line.productName}
                      {line.sku ? <span className="block text-xs text-muted-foreground">{line.sku}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.expectedQuantity}{line.defaultUnit ? ` ${line.defaultUnit}` : ''}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.receivedToDate}
                      {outstanding > 0 && line.receivedToDate > 0 ? (
                        <Badge variant="outline" className="ml-2">{outstanding} short</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.unitPrice === null ? '—' : money(line.unitPrice)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Timeline">
        <PurchaseOrderTimeline purchaseOrder={po} />
      </Section>

      {/* Pictures the floor took as the delivery arrived. Shows nothing
          when there are none. */}
      <PhotoStrip entityType="purchase_order" entityId={po.id} label="Photos from receiving" />

      {po.notes ? (
        <Section title="Notes">
          <p className="text-sm">{po.notes}</p>
        </Section>
      ) : null}

      {/* Delete only ever reaches a 'pending' order, so nothing has
          happened against it yet — a real delete, not an archive. */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="gap-4 rounded-lg p-5 sm:max-w-md">
          <AlertDialogHeader className="gap-1">
            <AlertDialogTitle className="text-base">Delete this purchase order?</AlertDialogTitle>
            <AlertDialogDescription className="font-medium text-foreground">
              {po.poNumber} · {po.supplierName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Nothing has been sent to the supplier or received against it yet.
            This removes it for good — <span className="font-semibold text-foreground">cannot be undone.</span>
          </p>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              type="button" variant="outline" disabled={deleting} onClick={runDelete}
              className="border-brand text-brand hover:bg-brand hover:text-white" loading={deleting}>
              <Trash2 />
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DetailPanel>
  );
}
