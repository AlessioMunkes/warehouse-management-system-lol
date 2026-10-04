// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/components/RequestDetailPanel.jsx
//
// One benevolent request in full: what was asked for, the items that
// were approved, and — once a worker has confirmed — what actually went
// out against what was approved. Older requests, logged before items
// existed, show their free text and notes and no item list.
// ─────────────────────────────────────────────────────────────
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/ui/status-badge';
import DetailPanel from '@/components/ui/detail-panel';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { fmtQty } from '@/lib/quantity';
import { timeAgo } from '../../notifications/notificationMatrix';
import { DISPLAY_LABELS, displayStatus, isFlagged, packerLabel, shortProductNames } from '../requestViews';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : '—';

const Fact = ({ label, children }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm">{children}</dd>
  </div>
);

export default function RequestDetailPanel({ request: r, onClose }) {
  const confirmed = r.outcome === 'fulfilled' || r.outcome === 'partially_fulfilled';
  const status = displayStatus(r);
  const packer = packerLabel(r);

  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={`Benevolent request #${r.id}`}
      title={r.callerName || 'An unnamed caller'}
      badges={(
        <StatusBadge kind="communityRequest" status={status}>
          {DISPLAY_LABELS[status] ?? status}
        </StatusBadge>
      )}
    >
      {isFlagged(r) ? (
        <p role="status" className="rounded-md bg-warn-soft p-3 text-sm text-warn">
          Needs new items, flagged {timeAgo(r.itemsShortAt)}. Pallet packing used the stock set aside
          for {shortProductNames(r).join(', ') || 'one of the items'}.
        </p>
      ) : null}

      <section className="space-y-1">
        <h3 className="text-sm font-medium">What they asked for</h3>
        <p className="whitespace-pre-line text-sm">{r.itemsRequested}</p>
        {r.quantityNote ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{r.quantityNote}</p>
        ) : null}
      </section>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label="Caller">
          {r.callerName || 'Not given'}
          {r.callerContact ? <span className="block text-muted-foreground">{r.callerContact}</span> : null}
        </Fact>
        <Fact label="Requested">{fmtDateTime(r.requestedAt)}</Fact>
        {r.approvedAt ? (
          <Fact label="Approved">
            {fmtDateTime(r.approvedAt)}{r.approvedByName ? ` by ${r.approvedByName}` : ''}
          </Fact>
        ) : null}
        {packer ? <Fact label="Packer">{packer}</Fact> : null}
        {r.resolvedAt ? (
          <Fact label={r.outcome === 'declined' ? 'Declined' : 'Confirmed'}>{fmtDateTime(r.resolvedAt)}</Fact>
        ) : null}
      </dl>

      {r.items.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Items</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Went out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-normal">
                      {i.productName}
                      {i.shortAt ? <Badge variant="outline" className="ml-2">Short</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(i.quantityApproved, i.unit)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {confirmed ? fmtQty(i.quantityReleased, i.unit) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {r.outcomeNote ? (
        <section className="space-y-1">
          <h3 className="text-sm font-medium">{r.outcome === 'declined' ? 'Why it was declined' : 'Outcome note'}</h3>
          <p className="whitespace-pre-line text-sm">{r.outcomeNote}</p>
        </section>
      ) : null}
    </DetailPanel>
  );
}
